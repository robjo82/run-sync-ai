"""Conversational coaching service for interactive plan management - Enhanced version."""

import json
import time
from datetime import datetime, date
from typing import Dict, Any, Optional, List, Tuple
from sqlalchemy.orm import Session

from app.models import User, RaceGoal, CoachingThread, CoachingMessage, PlannedSession
from app.services.llm_service import LLMService
from app.services.plan_generator_service import PlanGeneratorService
from app.services.athlete_profile_service import AthleteProfileService


class ConversationalCoachService:
    """
    Enhanced service for handling conversational interactions with the AI coach.
    
    Key improvements:
    - Injects athlete profile into all prompts
    - Uses LLM-first intent classification (no keyword fallback)
    - Extended conversation history (20 messages)
    - Questioning mode before plan generation
    - Smart error handling with reformulation suggestions
    """
    
    # Message intent types
    INTENT_PLAN_REQUEST = "plan_request"
    INTENT_QUESTION = "question"
    INTENT_ADJUSTMENT = "adjustment"
    INTENT_NEEDS_INFO = "needs_info"  # NEW: Coach needs more info before acting
    INTENT_CONFIRMATION = "confirmation"
    INTENT_OFF_TOPIC = "off_topic"
    INTENT_GENERAL = "general"
    
    # Coach personality system prompt
    COACH_SYSTEM_PROMPT = """Tu es un coach de course à pied expert avec 15 ans d'expérience en entraînement personnalisé.

## Ta personnalité
- Bienveillant mais exigeant
- Tu analyses TOUJOURS les données avant de répondre
- Tu cites des valeurs concrètes (allures, zones cardiaques, records)
- Tu expliques le "pourquoi" de tes recommandations
- Tu poses UNE question si une info cruciale manque
- Tu évites les généralités - sois spécifique à CET athlète

## Règles absolues
1. Ne génère JAMAIS de plan sans connaître les jours disponibles
2. Cite toujours les records de l'athlète quand pertinent
3. Explique tes calculs (ex: "Allure marathon = VMA × 0.75 ≈ X:XX/km")
4. Si l'athlète exprime une contrainte, intègre-la immédiatement
5. Limite tes réponses à 300 mots sauf si plus de détail est demandé

{athlete_profile}
"""
    
    def __init__(self, db: Session):
        self.db = db
        self.llm_service = LLMService()
        self.profile_service = AthleteProfileService(db)
    
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
        
        # Get athlete profile for context
        athlete_profile = self.profile_service.get_profile_summary_for_prompt(user, goal)
        
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
        
        # Classify intent using LLM (smarter than keywords)
        history = self._get_thread_history(thread, limit=20)
        intent = await self._classify_intent_smart(user_message, goal, history)
        user_msg.message_type = intent
        self.db.commit()
        
        # Process based on intent
        sessions_affected = None
        
        if intent == self.INTENT_OFF_TOPIC:
            coach_response = self._get_off_topic_response()
            
        elif intent == self.INTENT_PLAN_REQUEST:
            # Check if we have enough info
            needs_info = await self._check_plan_prerequisites(goal, history, athlete_profile)
            if needs_info:
                coach_response = needs_info
            else:
                coach_response, sessions_affected = await self._handle_plan_request(
                    user_message, goal, user, thread, athlete_profile
                )
            
        elif intent == self.INTENT_ADJUSTMENT:
            coach_response, sessions_affected = await self._handle_adjustment(
                user_message, goal, user, thread, athlete_profile, history
            )
            
        elif intent == self.INTENT_QUESTION:
            coach_response = await self._handle_question(
                user_message, goal, thread, athlete_profile, history
            )
            
        else:  # GENERAL, NEEDS_INFO, CONFIRMATION
            coach_response = await self._handle_general(
                user_message, goal, thread, athlete_profile, history
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
    
    async def _classify_intent_smart(
        self,
        message: str,
        goal: RaceGoal,
        history: str,
    ) -> str:
        """Classify intent using LLM for better accuracy."""
        classification_prompt = f"""Classifie l'intention de ce message dans un contexte de coaching course à pied.

## Historique récent
{history[-1500:] if len(history) > 1500 else history}

## Message actuel
"{message}"

## Contexte
Objectif: {goal.name} ({goal.race_type}) le {goal.race_date}
Plan existant: {"Oui" if goal.plan_generated else "Non"}

## Instructions
Réponds avec UNIQUEMENT UN de ces mots (rien d'autre):
- plan_request → demande de créer/générer un plan d'entraînement
- adjustment → demande de modifier le plan (changer jour, ajouter/supprimer séance, adapter volume...)
- question → question sur l'entraînement, nutrition, récupération, technique...
- general → conversation, remerciement, reformulation, précision sur contraintes...
- off_topic → sujet sans rapport avec le sport

Attention:
- "Cool, mais..." ou "Ok mais..." suivi d'une contrainte = adjustment
- "Pourquoi..." ou "C'est quoi..." = question
- Mention de jours (lundi, mardi...) + contexte de changement = adjustment"""
        
        try:
            response = await self.llm_service.provider.complete(
                classification_prompt,
                model="flash",
                temperature=0.1,
                max_tokens=50,
                thinking_level="off",  # Fast classification
            )
            # More robust parsing: look for the intent keyword anywhere in the response
            response_lower = response.strip().lower()
            
            valid_intents = [
                self.INTENT_PLAN_REQUEST, self.INTENT_ADJUSTMENT,
                self.INTENT_QUESTION, self.INTENT_GENERAL, self.INTENT_OFF_TOPIC
            ]
            
            # Check if any valid intent is in the response
            for valid_intent in valid_intents:
                if valid_intent in response_lower:
                    return valid_intent
                    
        except Exception as e:
            print(f"Intent classification error: {e}")
        
        # Fallback: Keyword analysis if LLM fails or is unclear
        message_lower = message.lower()
        
        # Explicit plan creation commands
        if any(phrase in message_lower for phrase in ["génère mon plan", "générer mon plan", "créer mon plan", "faire mon plan"]):
            return self.INTENT_PLAN_REQUEST

        # General plan keywords
        if any(w in message_lower for w in ["créer un plan", "faire un plan", "générer un plan", "mon plan", "programme"]):
            if "objectif" in message_lower or "course" in message_lower:
                return self.INTENT_PLAN_REQUEST
                
        # Fallback: Training days mention (crucial for plan creation steps)
        days_keywords = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche", "semaine", "jours"]
        if any(d in message_lower for d in days_keywords):
            # If we are talking about training days
            if any(w in message_lower for w in ["entrainer", "entraînement", "dispo", "peux", "libre"]):
                # If plan not generated yet, it's a request to continue creation
                if not goal.plan_generated:
                    return self.INTENT_PLAN_REQUEST
                # If plan exists, it might be an adjustment
                return self.INTENT_ADJUSTMENT
                
        # Strong keywords for adjustment
        if any(w in message_lower for w in ["modifier", "changer", "déplacer", "annuler", "remplacer", "décale"]):
            return self.INTENT_ADJUSTMENT
        
        return self.INTENT_GENERAL
    
    async def _check_plan_prerequisites(
        self,
        goal: RaceGoal,
        history: str,
        athlete_profile: str,
    ) -> Optional[str]:
        """
        Check if we have enough information to generate a plan.
        If not, return a question to ask. If yes, return None.
        """
        # Check if plan already exists
        existing_sessions = self.db.query(PlannedSession).filter(
            PlannedSession.race_goal_id == goal.id,
            PlannedSession.is_archived == False
        ).count()
        
        if existing_sessions > 0:
            return (
                f"Tu as déjà un plan actif avec **{existing_sessions} séances**. 📋\n\n"
                "Que souhaites-tu faire ?\n"
                "• **Modifier** le plan existant (dis-moi ce que tu veux changer)\n"
                "• **Régénérer** un nouveau plan (l'ancien sera archivé)\n\n"
                "💡 Si tu veux juste ajuster quelques séances, la modification est plus rapide !"
            )
        
        # Check if we know the available days
        days_mentioned = any(day in history.lower() for day in [
            "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche",
            "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
            "jours par semaine", "fois par semaine", "séances par semaine"
        ])
        
        if not days_mentioned:
            return (
                "Avant de créer ton plan, j'ai besoin de quelques infos ! 📝\n\n"
                "**1. Combien de jours par semaine peux-tu t'entraîner ?**\n"
                "(Idéalement entre 3 et 5 pour un marathon)\n\n"
                "**2. Y a-t-il des jours impossibles ?**\n"
                "(Ex: basket le lundi, travail le samedi...)\n\n"
                "**3. Quel jour préfères-tu pour la sortie longue ?**\n"
                "(Généralement samedi ou dimanche)\n\n"
                "Dis-moi tout ça et je te prépare un plan sur mesure ! 🏃"
            )
        
        return None  # All prerequisites met
    
    def _get_off_topic_response(self) -> str:
        """Return polite refusal for off-topic messages."""
        return (
            "Je suis ton coach de course à pied, spécialisé dans l'entraînement et la préparation des courses. 🏃\n\n"
            "Je peux t'aider avec :\n"
            "• La planification de ton entraînement\n"
            "• Des conseils sur les allures et l'intensité\n"
            "• La nutrition sportive et la récupération\n"
            "• La préparation mentale pour tes courses\n\n"
            "Comment puis-je t'aider avec ton entraînement ?"
        )
    
    async def _handle_plan_request(
        self,
        message: str,
        goal: RaceGoal,
        user: User,
        thread: CoachingThread,
        athlete_profile: str,
    ) -> Tuple[str, Optional[List[Dict[str, Any]]]]:
        """Handle a request to generate a training plan."""
        # Extract constraints from conversation
        history = self._get_thread_history(thread, limit=20)
        
        # Generate the plan with full context
        generator = PlanGeneratorService(self.db)
        
        try:
            sessions, explanation = await generator.generate_plan(goal, user, chat_context=history)
            
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
            
            # Build rich response with athlete-specific details
            weeks = goal.weeks_until_race
            response = (
                f"✅ **Plan généré avec succès !**\n\n"
                f"J'ai créé **{len(sessions)} séances** sur **{weeks} semaines** "
                f"pour te préparer au {goal.name}.\n\n"
            )
            
            # Add personalized explanation
            if explanation:
                response += f"## 📋 Ma Stratégie\n\n{explanation}\n\n"
            else:
                # Generate explanation if missing
                response += await self._generate_plan_explanation(goal, athlete_profile, sessions)
            
            response += (
                "---\n"
                "📅 Tu peux voir ton calendrier dans l'onglet **Calendrier**.\n\n"
                "💬 N'hésite pas à me demander des ajustements !\n"
                "Par exemple: *\"Déplace les fractionnés du mardi au mercredi\"*"
            )
            
            return response, sessions_affected
            
        except Exception as e:
            return (
                f"❌ Je n'ai pas pu générer le plan : {str(e)}\n\n"
                "Vérifie que :\n"
                "• La date de ta course est dans au moins 4 semaines\n"
                "• Tu as bien indiqué un objectif de temps\n\n"
                "Quel est le problème ? Je peux t'aider à le résoudre.",
                None
            )
    
    async def _generate_plan_explanation(
        self,
        goal: RaceGoal,
        athlete_profile: str,
        sessions: List[PlannedSession],
    ) -> str:
        """Generate a personalized explanation for the plan."""
        explanation_prompt = f"""{self.COACH_SYSTEM_PROMPT.format(athlete_profile=athlete_profile)}

## Tâche
Tu viens de créer un plan d'entraînement. Explique-le à l'athlète en 200 mots max.

## Contexte
- Objectif: {goal.name} ({goal.race_type}) le {goal.race_date}
- Temps cible: {f"{goal.target_time_seconds // 3600}h {(goal.target_time_seconds % 3600) // 60:02d}" if goal.target_time_seconds else 'Non défini'}
- Nombre de séances: {len(sessions)}
- Semaines de préparation: {goal.weeks_until_race}

## Format attendu
- Cite les records de l'athlète pour justifier les allures
- Explique le calcul de l'allure marathon si temps cible défini
- Mentionne les phases (base, build, peak, taper)
- Donne UN conseil clé pour réussir cette préparation

Sois spécifique, pas générique."""
        
        try:
            explanation = await self.llm_service.provider.complete(
                explanation_prompt,
                model="pro",  # Use pro for better explanations
                temperature=0.6,
                max_tokens=2000,
                thinking_level="medium",  # Medium thinking for personalization
            )
            return explanation
        except Exception:
            return ""
    
    async def _handle_adjustment(
        self,
        message: str,
        goal: RaceGoal,
        user: User,
        thread: CoachingThread,
        athlete_profile: str,
        history: str,
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
            # Smart redirect: User wants to adjust/create but has no plan -> Create it
            return await self._handle_plan_request(message, goal, user, thread, athlete_profile)
        
        # Build context for LLM
        sessions_context = "\n".join([
            f"- {s.scheduled_date} ({s.scheduled_date.strftime('%A')}): {s.title} ({s.session_type}, {s.target_duration}min)"
            for s in sessions[:21]  # Next 3 weeks
        ])
        
        adjustment_prompt = f"""{self.COACH_SYSTEM_PROMPT.format(athlete_profile=athlete_profile)}

## Historique de conversation
{history[-2000:] if len(history) > 2000 else history}

## Demande actuelle
"{message}"

## Plan actuel (3 prochaines semaines)
{sessions_context}

## Instructions
1. Analyse la demande de l'athlète
2. Si la demande est claire, propose des modifications CONCRÈTES avec les nouvelles dates/séances
3. Si la demande est floue, pose UNE question de clarification
4. Rappelle les contraintes déjà mentionnées (ex: basket le lundi)
5. Explique pourquoi la modification proposée maintient la cohérence du plan

Format: réponse en français, 200 mots max, utilise du markdown pour la lisibilité."""
        
        try:
            response = await self.llm_service.provider.complete(
                adjustment_prompt,
                model="pro",  # Use pro for complex adjustments
                temperature=0.5,
                max_tokens=2000,
                thinking_level="high",  # High thinking for adjustments
            )
            
            # TODO: Actually modify sessions based on LLM suggestions
            # For now, return the suggestion and ask for confirmation
            
            if "?" not in response:  # If coach made a concrete suggestion
                response += "\n\n✅ *Confirme si tu veux que j'applique ces changements !*"
            
            return response, None
            
        except Exception as e:
            return (
                "J'ai eu du mal à comprendre ta demande. 🤔\n\n"
                "Peux-tu préciser ce que tu veux modifier ?\n"
                "Par exemple :\n"
                "• *\"Déplace la séance de mardi au mercredi\"*\n"
                "• *\"Pas de séance le lundi, j'ai basket\"*\n"
                "• *\"Ajoute une séance de côtes le jeudi\"*",
                None
            )
    
    async def _handle_question(
        self,
        message: str,
        goal: RaceGoal,
        thread: CoachingThread,
        athlete_profile: str,
        history: str,
    ) -> str:
        """Handle a training-related question."""
        question_prompt = f"""{self.COACH_SYSTEM_PROMPT.format(athlete_profile=athlete_profile)}

## Historique
{history[-1500:] if len(history) > 1500 else history}

## Question
"{message}"

## Instructions
1. Réponds de façon claire et concise (150 mots max)
2. Donne des valeurs concrètes quand possible (allures, zones, durées)
3. Relie ta réponse au profil de l'athlète si pertinent
4. Si la question est très technique, propose d'approfondir

Réponds en français, utilise des emojis avec parcimonie."""
        
        try:
            response = await self.llm_service.provider.complete(
                question_prompt,
                model="pro",  # Use pro for expert answers
                temperature=0.5,
                max_tokens=1500,
                thinking_level="medium",  # Medium thinking for questions
            )
            return response
        except Exception:
            return (
                "Je n'ai pas pu traiter ta question. 😕\n"
                "Peux-tu la reformuler ?"
            )
    
    async def _handle_general(
        self,
        message: str,
        goal: RaceGoal,
        thread: CoachingThread,
        athlete_profile: str,
        history: str,
    ) -> str:
        """Handle general conversation."""
        general_prompt = f"""{self.COACH_SYSTEM_PROMPT.format(athlete_profile=athlete_profile)}

## Historique
{history[-1000:] if len(history) > 1000 else history}

## Message
"{message}"

## Instructions
- Réponds de façon naturelle et encourageante (100 mots max)
- Si l'athlète donne une info importante (contrainte, préférence), confirme que tu l'as notée
- Essaie d'orienter vers une action concrète si pertinent
- Sois bref et dynamique

Réponds en français."""
        
        try:
            response = await self.llm_service.provider.complete(
                general_prompt,
                model="flash",
                temperature=0.6,
                max_tokens=1000,
                thinking_level="low",  # Low thinking for general chat
            )
            return response
        except Exception:
            return "Je suis là pour t'aider dans ta préparation ! 💪 Qu'est-ce que je peux faire pour toi ?"
    
    def _get_thread_history(self, thread: CoachingThread, limit: int = 20) -> str:
        """Get formatted conversation history (extended to 20 messages)."""
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
            role = "Athlète" if msg.role == "user" else "Coach"
            # Keep more content for context
            content = msg.content[:400] + "..." if len(msg.content) > 400 else msg.content
            history_lines.append(f"**{role}**: {content}")
        
        return "\n\n".join(history_lines)
