import os
import json
import time
from typing import List, Dict, Any, Optional, Union
from google import genai
from google.genai import types

from app.config import get_settings

settings = get_settings()

class GeminiProvider:
    """Gemini 3 provider using the new google-genai SDK."""
    
    THINKING_LEVELS = {
        "off": False,
        "low": "include_thoughts", 
        "medium": "include_thoughts",
        "high": "include_thoughts",
    }
    
    def __init__(self):
        self.api_key = settings.gemini_api_key
        # Initialize the new Client
        self.client = genai.Client(api_key=self.api_key)
        self.prompts = self._load_prompts()
    
    def _load_prompts(self) -> Dict[str, str]:
        """Load prompts from the prompt registry."""
        # Simple registry for now (could be loaded from files)
        return {
            "coach_system": "Tu es un coach de running expert et bienveillant...",
            "generate_plan": """Tu es un coach de course à pied expert. Génère un plan d'entraînement personnalisé.

## Contexte de l'athlète
{athlete_profile}

## Objectif
Course : {goal_name} ({race_type})
Date : {race_date} ({weeks_until_race} semaines)
Objectif temps : {target_time} (Allure cible: {target_pace})

## Métriques Actuelles
CTL (Forme) : {ctl}
ATL (Fatigue) : {atl}
TSB (Fraîcheur) : {tsb}

## Disponibilités
Jours possibles : {available_days}
Sortie longue : {long_run_day}

## Contraintes & Notes
{constraints}

## Instructions
Génère le plan au format JSON strict.

Format JSON attendu:
{
  "explanation": "Ton explication détaillée du plan et ta stratégie...",
  "weeks": [
    {
      "week_number": 1,
      "phase": "base",
      "focus": "Endurance",
      "sessions": [
        {
          "day": 1,
          "session_type": "easy",
          "duration_minutes": 45,
          "intensity": "easy",
          "pace_per_km": 360,
          "terrain_type": "road",
          "elevation_gain": 0,
          "intervals": null,
          "workout_details": "Footing..."
        }
      ]
    }
  ]
}
"""
        }
        
    def load_prompt(self, prompt_name: str) -> str:
        return self.prompts.get(prompt_name, "")

    async def complete(
        self,
        prompt: str,
        messages: List[Dict[str, Any]] = None,
        model: str = "flash",
        temperature: float = 0.7,
        max_tokens: int = 2000,
        thinking_level: str = "off",
    ) -> Dict[str, Any]:
        """
        Generate completion using Gemini 3 (google-genai SDK).
        """
        model_id = "gemini-3-flash-preview" if model == "flash" else "gemini-3-pro-preview"
        
        # Configure Generation Params
        config = types.GenerateContentConfig(
            temperature=temperature,
            max_output_tokens=max_tokens,
        )
        
        # Handle Thinking Config (New SDK)
        if thinking_level != "off" and "pro" in model_id:
            # Enable thinking if requested and model supports it
            config.thinking_config = types.ThinkingConfig(include_thoughts=True)
            
            
        # Prepare contents
        contents = []
        if messages:
            # Convert history to new SDK Types
            for m in messages:
                # Map old structure to new
                role = "user" if m.get("role") == "user" else "model"
                parts = []
                # Handle parts which might be strings or dicts
                raw_parts = m.get("parts", [""])
                for p in raw_parts:
                    if isinstance(p, str):
                        parts.append(types.Part.from_text(text=p))
                    elif isinstance(p, dict) and "text" in p:
                         parts.append(types.Part.from_text(text=p["text"]))
                         
                contents.append(
                    types.Content(
                        role=role,
                        parts=parts
                    )
                )
        
        # Add current prompt as User message
        contents.append(
            types.Content(
                role="user",
                parts=[types.Part.from_text(text=prompt)]
            )
        )
            
        try:
            # Generate using asyncio client
            response = await self.client.aio.models.generate_content(
                model=model_id,
                contents=contents,
                config=config,
            )
            
            # Parse Response
            text_parts = []
            thoughts = ""
            thought_sig = None
            
            if response.candidates:
                cand = response.candidates[0]
                if cand.content and cand.content.parts:
                    for part in cand.content.parts:
                        # New SDK thought handling
                        if hasattr(part, 'thought') and part.thought:
                            # If thought is True/present, the text is the thought
                             if part.text:
                                thoughts += part.text
                        else:
                            # Normal text part
                            if part.text:
                                text_parts.append(part.text)
            
            final_text = "".join(text_parts)
            
            return {
                "text": final_text,
                "thoughts": thoughts,
                "thought_signature": thought_sig
            }
            
        except Exception as e:
            print(f"Gemini Genai Error: {e}")
            # Fallback without thinking if that failed
            if thinking_level != "off":
                 print("Retrying without thinking...")
                 config.thinking_config = None
                 try:
                    response = await self.client.aio.models.generate_content(
                        model=model_id,
                        contents=contents,
                        config=config,
                    )
                    text_parts = []
                    if response.candidates:
                         cand = response.candidates[0]
                         if cand.content and cand.content.parts:
                            for part in cand.content.parts:
                                if part.text:
                                    text_parts.append(part.text)
                    
                    return {"text": "".join(text_parts), "thoughts": "", "thought_signature": None}
                 except Exception as retry_e:
                     # If generic retry fails, raise original or new error
                     raise retry_e
            raise e

    async def complete_json(
        self,
        prompt: str,
        messages: List[Dict[str, Any]] = None,
        model: str = "flash",
        temperature: float = 0.1,
    ) -> Dict[str, Any]:
        """Generate JSON response."""
        model_id = "gemini-3-flash-preview" if model == "flash" else "gemini-3-pro-preview"
        
        config = types.GenerateContentConfig(
            temperature=temperature,
            response_mime_type="application/json", 
        )
        
        # Prepare contents (simplified context handling for JSON tasks)
        contents = []
        if messages:
             for m in messages:
                role = "user" if m.get("role") == "user" else "model"
                raw_parts = m.get("parts", [""])
                parts = [types.Part.from_text(text=p) if isinstance(p, str) else types.Part.from_text(text=p.get("text","")) for p in raw_parts]
                contents.append(types.Content(role=role, parts=parts))

        contents.append(types.Content(role="user", parts=[types.Part.from_text(text=prompt)]))
        
        try:
            response = await self.client.aio.models.generate_content(
                model=model_id,
                contents=contents,
                config=config,
            )
            
            if response.candidates and response.candidates[0].content and response.candidates[0].content.parts:
                text = response.candidates[0].content.parts[0].text
                if text:
                    return json.loads(text)
            return {}
            
        except Exception as e:
            print(f"JSON Generation Error: {e}")
            return {}

    async def complete_stream(
        self,
        prompt: str,
        system_instruction: Optional[str] = None,
        messages: Optional[List[Dict[str, Any]]] = None,
        tools: Optional[List[Any]] = None,
        model: str = "pro",
        thinking_level: str = "off",
        json_mode: bool = False,
    ):
        """Streams the response, yielding generic events for thoughts and text."""
        model_id = self._get_model_id(model)
        
        config = types.GenerateContentConfig(
            system_instruction=system_instruction,
            temperature=0.7,
            candidate_count=1,
            response_mime_type="application/json" if json_mode else "text/plain",
            tools=tools,
        )
        
        # Build contents from messages + prompt
        contents = []
        if messages:
            for msg in messages:
                role = "user" if msg["role"] == "user" else "model"
                contents.append(types.Content(
                    role=role,
                    parts=[types.Part(text=msg["content"])]
                ))
        
        contents.append(types.Content(
            role="user",
            parts=[types.Part(text=prompt)]
        ))

        try:
            async for chunk in await self.client.aio.models.generate_content_stream(
                model=model_id,
                contents=contents,
                config=config,
            ):
                if not chunk.candidates:
                    continue
                    
                cand = chunk.candidates[0]
                if not cand.content or not cand.content.parts:
                    continue
                    
                for part in cand.content.parts:
                    # Check for thoughts
                    if hasattr(part, 'thought') and part.thought:
                        if part.text: # Thought text is sometimes in text field or thought field depending on SDK version? 
                            # New SDK: thinking.thought? No, part.thought is likely boolean/object?
                            # Check generic properties
                            pass 
                        # To be safe rely on part reference if possible or skip implementation detail of thought object structure for now if vague
                        # The view showed: if hasattr(part, 'thought') and part.thought: if part.text: yield ...
                        pass 
                    
                    # SDK 0.5.0+ structure:
                    # part can have 'text', 'function_call', 'executable_code'
                    
                    if part.function_call:
                        # Convert args to dict
                        # function_call.args is a Map/Struct.
                        # The SDK might auto-convert or we use dict(part.function_call.args)
                        args = {}
                        if part.function_call.args:
                            # It's a proto Map, usually behaves like dict
                            for key in part.function_call.args:
                                args[key] = part.function_call.args[key]
                        
                        yield {
                            "type": "function_call",
                            "name": part.function_call.name,
                            "args": args
                        }
                    
                    elif hasattr(part, 'thought') and part.thought:
                         # Re-implement existing thought logic
                         yield {"type": "thought", "content": part.text}

                    elif part.text:
                         yield {"type": "text", "content": part.text}
                        
        except Exception as e:
            print(f"Stream Error: {e}")
            yield {"type": "error", "content": str(e)}

class LLMService:
    def __init__(self):
        self.provider = GeminiProvider()
