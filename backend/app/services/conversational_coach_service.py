"""Conversational coaching service for interactive plan management."""

import json
import time
from datetime import datetime, date
from typing import Dict, Any, Optional, List, Tuple
from sqlalchemy.orm import Session

from app.models import User, RaceGoal, CoachingThread, CoachingMessage, PlannedSession
from app.services.llm_service import LLMService
from app.services.plan_generator_service import PlanGeneratorService


class ConversationalCoachService:
    """Service for handling conversational interactions with the AI coach."""
    
    # Message intent types
    INTENT_PLAN_REQUEST = "plan_request"
    INTENT_QUESTION = "question"
    INTENT_ADJUSTMENT = "adjustment"
    INTENT_CONFIRMATION = "confirmation"
    INTENT_OFF_TOPIC = "off_topic"
    INTENT_GENERAL = "general"
    
    # Guard rail topics (refuse these)
    BLOCKED_TOPICS = [
        "politique", "politics", "religion", "sexe", "sex",
        "violence", "drogue", "drugs", "argent", "money",
        "investissement", "investment", "crypto", "bitcoin",
        "programmation", "programming", "code", "python", "javascript",
        "recette", "recipe", "cuisine", "cooking",
    ]
    
    def __init__(self, db: Session):
        self.db = db
        self.llm_service = LLMService()
    
    async def process_message(
        self,
        thread_id: int,
        user_message: str,
        user: User,
        goal: RaceGoal,
    ) -> Dict[str, Any]:
        """
        Process a user message and generate coach response.
        
        Returns dict with user_message, coach_response, and optionally sessions_modified.
        """
        start_time = time.time()
        
        thread = self.db.query(CoachingThread).filter(
            CoachingThread.id == thread_id
        ).first()
        
        if not thread:
            raise ValueError("Thread not found")
        
        # Save user message
        user_msg = CoachingMessage(
            thread_id=thread_id,
            role="user",
            content=user_message,
            message_type=self.INTENT_GENERAL,
        )
        self.db.add(user_msg)
        self.db.commit()
        self.db.refresh(user_msg)
        
        # Classify intent
        intent = await self._classify_intent(user_message, thread, goal)
        user_msg.message_type = intent
        self.db.commit()
        
        # Process based on intent
        sessions_affected = None
        
        if intent == self.INTENT_OFF_TOPIC:
            coach_response = self._get_off_topic_response()
            
        elif intent == self.INTENT_PLAN_REQUEST:
            coach_response, sessions_affected = await self._handle_plan_request(
                user_message, goal, user, thread
            )
            
        elif intent == self.INTENT_ADJUSTMENT:
            coach_response, sessions_affected = await self._handle_adjustment(
                user_message, goal, user, thread
            )
            
        elif intent == self.INTENT_QUESTION:
            coach_response = await self._handle_question(
                user_message, goal, thread
            )
            
        else:
            coach_response = await self._handle_general(
                user_message, goal, thread
            )
        
        # Calculate processing time
        processing_time_ms = int((time.time() - start_time) * 1000)
        
        # Save coach response
        coach_msg = CoachingMessage(
            thread_id=thread_id,
            role="coach",
            content=coach_response,
            message_type="response",
            sessions_affected=sessions_affected,
            processing_time_ms=processing_time_ms,
        )
        self.db.add(coach_msg)
        
        # Update thread timestamp
        thread.updated_at = datetime.utcnow()
        self.db.commit()
        self.db.refresh(coach_msg)
        
        return {
            "user_message": user_msg,
            "coach_response": coach_msg,
            "sessions_modified": sessions_affected,
        }
    
    async def _classify_intent(
        self,
        message: str,
        thread: CoachingThread,
        goal: RaceGoal,
    ) -> str:
        """Classify the intent of a user message."""
        message_lower = message.lower()
        
        # Check for blocked topics first
        for topic in self.BLOCKED_TOPICS:
            if topic in message_lower:
                return self.INTENT_OFF_TOPIC
        
        # Simple keyword-based classification (fast path)
        plan_keywords = ["génère", "générer", "crée", "créer", "plan", "programme", "planifie"]
        adjust_keywords = ["déplace", "change", "modifie", "ajoute", "supprime", "annule", 
                          "moins", "plus", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche", "lundi"]
        question_keywords = ["qu'est-ce", "pourquoi", "comment", "c'est quoi", "explique", 
                            "différence", "conseil", "recommande"]
        
        if any(kw in message_lower for kw in plan_keywords):
            return self.INTENT_PLAN_REQUEST
        
        if any(kw in message_lower for kw in adjust_keywords):
            return self.INTENT_ADJUSTMENT
        
        if any(kw in message_lower for kw in question_keywords):
            return self.INTENT_QUESTION
        
        # For ambiguous cases, use LLM
        try:
            classification_prompt = f"""
Classifie l'intention de ce message utilisateur dans le contexte d'un coaching de course à pied.

Message: "{message}"

Contexte: L'utilisateur prépare {goal.name} ({goal.race_type}) le {goal.race_date}.

Réponds avec UNIQUEMENT un de ces mots:
- plan_request (demande de générer/créer un plan d'entraînement)
- adjustment (demande de modifier le plan existant)
- question (question sur l'entraînement, la course, la nutrition, etc.)
- general (conversation générale liée au running)
- off_topic (sujet sans rapport avec le sport/entraînement)

Réponse:"""
            
            response = await self.llm_service.provider.complete(classification_prompt)
            intent = response.strip().lower()
            
            if intent in [self.INTENT_PLAN_REQUEST, self.INTENT_ADJUSTMENT, 
                         self.INTENT_QUESTION, self.INTENT_GENERAL, self.INTENT_OFF_TOPIC]:
                return intent
        except Exception:
            pass
        
        return self.INTENT_GENERAL
    
    def _get_off_topic_response(self) -> str:
        """Return polite refusal for off-topic messages."""
        return (
            "Je suis ton coach de course à pied, spécialisé dans l'entraînement et la préparation des courses. 🏃\n\n"
            "Je peux t'aider avec :\n"
            "• La planification de ton entraînement\n"
            "• Des conseils sur les allures et l'intensité\n"
            "• La nutrition sportive et la récupération\n"
            "• La préparation mentale pour tes courses\n\n"
            "Pour d'autres sujets, je te recommande de consulter une source appropriée. "
            "Comment puis-je t'aider avec ton entraînement ?"
        )
    
    async def _handle_plan_request(
        self,
        message: str,
        goal: RaceGoal,
        user: User,
        thread: CoachingThread,
    ) -> Tuple[str, Optional[List[Dict[str, Any]]]]:
        """Handle a request to generate a training plan."""
        # Check if plan already exists
        existing_sessions = self.db.query(PlannedSession).filter(
            PlannedSession.race_goal_id == goal.id,
            PlannedSession.is_archived == False
        ).count()
        
        if existing_sessions > 0:
            return (
                f"Tu as déjà un plan actif avec {existing_sessions} séances. "
                "Souhaites-tu que je le modifie, ou préfères-tu que j'en génère un nouveau ?\n\n"
                "⚠️ Générer un nouveau plan archivera les séances actuelles.",
                None
            )
        
        # Generate the plan
        generator = PlanGeneratorService(self.db)
        
        try:
            sessions, explanation = await generator.generate_plan(goal, user)
            
            # Mark goal as having plan
            goal.plan_generated = True
            goal.plan_generated_at = date.today()
            goal.status = "active"
            self.db.commit()
            
            # Build sessions affected list
            sessions_affected = [
                {"id": s.id, "action": "created", "title": s.title}
                for s in sessions
            ]
            
            response = (
                f"✅ **Plan généré avec succès !**\n\n"
                f"J'ai créé {len(sessions)} séances sur {goal.weeks_until_race} semaines "
                f"pour te préparer au {goal.name}.\n\n"
                f"{explanation}\n\n"
                "Tu peux voir ton calendrier d'entraînement dans l'onglet 'Calendrier'. "
                "N'hésite pas à me demander des ajustements si certains jours ne te conviennent pas !"
            )
            
            return response, sessions_affected
            
        except Exception as e:
            return (
                f"❌ Désolé, je n'ai pas pu générer le plan : {str(e)}\n\n"
                "Vérifie que la date de ta course est dans au moins 4 semaines et réessaie.",
                None
            )
    
    async def _handle_adjustment(
        self,
        message: str,
        goal: RaceGoal,
        user: User,
        thread: CoachingThread,
    ) -> Tuple[str, Optional[List[Dict[str, Any]]]]:
        """Handle a request to modify the training plan."""
        # Get current plan sessions
        sessions = (
            self.db.query(PlannedSession)
            .filter(
                PlannedSession.race_goal_id == goal.id,
                PlannedSession.is_archived == False,
                PlannedSession.scheduled_date >= date.today()
            )
            .order_by(PlannedSession.scheduled_date)
            .all()
        )
        
        if not sessions:
            return (
                "Tu n'as pas encore de plan actif ! "
                "Dis-moi de générer un plan et je te proposerai un programme adapté.",
                None
            )
        
        # Build context for LLM
        sessions_context = "\n".join([
            f"- {s.scheduled_date} ({s.scheduled_date.strftime('%A')}): {s.title} ({s.session_type}, {s.target_duration}min)"
            for s in sessions[:14]  # Next 2 weeks
        ])
        
        adjustment_prompt = f"""
Tu es un coach de course à pied. L'utilisateur demande une modification de son plan.

Objectif: {goal.name} ({goal.race_type}) le {goal.race_date}
Demande: "{message}"

Séances à venir:
{sessions_context}

Analyse la demande et propose une modification concrète. 
Si la demande est claire (ex: "déplace les fractionnés au mardi"), indique les changements spécifiques.
Si la demande est vague, pose une question de clarification.

Réponds de façon concise et amicale en français.
"""
        
        try:
            response = await self.llm_service.provider.complete(adjustment_prompt)
            
            # For now, return the LLM suggestion without auto-modifying
            # TODO: Add actual session modification logic
            return (
                response + "\n\n"
                "💡 *Pour l'instant, je te suggère les changements. "
                "Confirme-moi si tu veux que je les applique !*",
                None
            )
        except Exception as e:
            return (
                "Je n'ai pas pu analyser ta demande. "
                "Peux-tu reformuler de façon plus précise ?",
                None
            )
    
    async def _handle_question(
        self,
        message: str,
        goal: RaceGoal,
        thread: CoachingThread,
    ) -> str:
        """Handle a training-related question."""
        # Get conversation history
        history = self._get_thread_history(thread, limit=6)
        
        question_prompt = f"""
Tu es un coach de course à pied expérimenté et bienveillant.
L'utilisateur prépare {goal.name} ({goal.race_type}) le {goal.race_date}.

Historique de conversation:
{history}

Question: "{message}"

Réponds de façon claire, concise et encourageante. 
Utilise des exemples concrets quand c'est pertinent.
Si la question est technique (allures, zones cardiaques, etc.), donne des valeurs concrètes.
Limite ta réponse à 200 mots maximum.
"""
        
        try:
            response = await self.llm_service.provider.complete(question_prompt)
            return response
        except Exception:
            return (
                "Je n'ai pas pu traiter ta question. "
                "Peux-tu la reformuler ?"
            )
    
    async def _handle_general(
        self,
        message: str,
        goal: RaceGoal,
        thread: CoachingThread,
    ) -> str:
        """Handle general conversation."""
        history = self._get_thread_history(thread, limit=4)
        
        general_prompt = f"""
Tu es un coach de course à pied amical et motivant.
L'utilisateur prépare {goal.name} ({goal.race_type}) le {goal.race_date}.

Historique:
{history}

Message: "{message}"

Réponds de façon naturelle et encourageante. 
Essaie de ramener la conversation vers l'entraînement si pertinent.
Sois bref (max 100 mots).
"""
        
        try:
            response = await self.llm_service.provider.complete(general_prompt)
            return response
        except Exception:
            return "Je suis là pour t'aider dans ta préparation ! 💪 Qu'est-ce que je peux faire pour toi ?"
    
    def _get_thread_history(self, thread: CoachingThread, limit: int = 6) -> str:
        """Get formatted conversation history."""
        messages = (
            self.db.query(CoachingMessage)
            .filter(CoachingMessage.thread_id == thread.id)
            .order_by(CoachingMessage.created_at.desc())
            .limit(limit)
            .all()
        )
        
        if not messages:
            return "(Nouvelle conversation)"
        
        # Reverse to get chronological order
        messages = list(reversed(messages))
        
        history_lines = []
        for msg in messages:
            role = "User" if msg.role == "user" else "Coach"
            content = msg.content[:200] + "..." if len(msg.content) > 200 else msg.content
            history_lines.append(f"{role}: {content}")
        
        return "\n".join(history_lines)
