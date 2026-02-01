"""Abstract LLM service with Gemini implementation."""

from abc import ABC, abstractmethod
from typing import Optional, Dict, Any
import json
import google.generativeai as genai
from pathlib import Path

from app.config import get_settings


class LLMProvider(ABC):
    """Abstract base class for LLM providers."""
    
    @abstractmethod
    async def complete(
        self,
        prompt: str,
        model: str = "default",
        temperature: float = 0.7,
        max_tokens: int = 2000,
        thinking_level: Optional[str] = None,  # "off", "low", "medium", "high"
    ) -> str:
        """Generate a completion from the LLM."""
        pass
    
    @abstractmethod
    async def complete_json(
        self,
        prompt: str,
        model: str = "default",
        temperature: float = 0.3,
        thinking_level: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Generate a JSON response from the LLM."""
        pass


class GeminiProvider(LLMProvider):
    """Google Gemini LLM provider with Gemini 3 thinking support."""
    
    MODELS = {
        "flash": "gemini-3-flash-preview",
        "pro": "gemini-3-pro-preview",
        "default": "gemini-3-flash-preview",
    }
    
    # Thinking levels for Gemini 3 models
    THINKING_LEVELS = {"off", "low", "medium", "high"}
    
    def __init__(self):
        settings = get_settings()
        genai.configure(api_key=settings.gemini_api_key)
        self._prompts_dir = Path(__file__).parent.parent / "prompts"
    
    def _get_model(self, model_name: str):
        """Get the Gemini model instance."""
        model_id = self.MODELS.get(model_name, self.MODELS["default"])
        return genai.GenerativeModel(model_id)
    
    async def complete(
        self,
        prompt: str,
        model: str = "default",
        temperature: float = 0.7,
        max_tokens: int = 2000,
        thinking_level: Optional[str] = None,  # "off", "low", "medium", "high"
    ) -> str:
        """Generate a completion using Gemini.
        
        Args:
            prompt: The prompt text
            model: Model to use (flash, pro, default)
            temperature: Creativity (0.0-1.0)
            max_tokens: Max output tokens
            thinking_level: Gemini 3 thinking depth ("off", "low", "medium", "high")
                           - "off" or None: No extended thinking
                           - "low": Fast thinking for simple tasks
                           - "medium": Balanced thinking
                           - "high": Deep thinking for complex reasoning
        """
        model_instance = self._get_model(model)
        
        # Build generation config
        config_dict = {
            "temperature": temperature,
            "max_output_tokens": max_tokens,
        }
        
        # Add thinking config for Gemini 3 if specified
        if thinking_level and thinking_level in self.THINKING_LEVELS and thinking_level != "off":
            config_dict["thinking_config"] = {"thinking_level": thinking_level}
        
        generation_config = genai.GenerationConfig(**config_dict)
        
        response = model_instance.generate_content(
            prompt,
            generation_config=generation_config,
        )
        
        return response.text
    
    async def complete_json(
        self,
        prompt: str,
        model: str = "default",
        temperature: float = 0.3,
        thinking_level: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Generate a JSON response using Gemini."""
        # Add JSON instruction to prompt
        json_prompt = f"{prompt}\n\nRespond with valid JSON only, no markdown formatting."
        
        response_text = await self.complete(
            json_prompt,
            model=model,
            temperature=temperature,
            max_tokens=4000,
            thinking_level=thinking_level,
        )
        
        # Clean up response (remove markdown code blocks if present)
        cleaned = response_text.strip()
        if cleaned.startswith("```json"):
            cleaned = cleaned[7:]
        if cleaned.startswith("```"):
            cleaned = cleaned[3:]
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3]
        
        return json.loads(cleaned.strip())
    
    def load_prompt(self, prompt_name: str) -> str:
        """Load a prompt template from the prompts directory."""
        prompt_file = self._prompts_dir / f"{prompt_name}.txt"
        if prompt_file.exists():
            return prompt_file.read_text()
        raise FileNotFoundError(f"Prompt template not found: {prompt_name}")


class LLMService:
    """High-level LLM service for the application."""
    
    def __init__(self, provider: Optional[LLMProvider] = None):
        self.provider = provider or GeminiProvider()
    
    async def classify_activity(self, activity_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Classify an activity using Gemini Flash.
        
        Returns:
            {
                "classification": "workout" | "commute" | "recovery" | "race",
                "confidence": 0.0-1.0,
                "reasoning": "...",
                "include_in_training_load": bool
            }
        """
        prompt = self.provider.load_prompt("classify_activity")
        prompt = prompt.replace("{activity_json}", json.dumps(activity_data, indent=2, default=str))
        
        result = await self.provider.complete_json(prompt, model="flash", temperature=0.2)
        
        # Ensure required fields
        classification = result.get("classification", "workout")
        
        # Determine if should include in training load
        include = classification in ["workout", "race"]
        if "include_in_training_load" not in result:
            result["include_in_training_load"] = include
        
        return result
    
    async def get_coaching_decision(self, context: Dict[str, Any]) -> Dict[str, Any]:
        """
        Get a coaching decision using Gemini Pro.
        
        Returns:
            {
                "action": "maintain" | "adjust" | "rest",
                "confidence": 0.0-1.0,
                "reasoning": "...",
                "adjustments": [...] | null,
                "message_to_user": "..."
            }
        """
        prompt = self.provider.load_prompt("coaching_decision")
        prompt = prompt.replace("{context_json}", json.dumps(context, indent=2, default=str))
        
        result = await self.provider.complete_json(prompt, model="pro", temperature=0.4)
        
        return result
