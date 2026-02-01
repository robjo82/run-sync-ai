
import asyncio
import os
import sys
from dotenv import load_dotenv

# Add backend to path
sys.path.append(os.path.join(os.path.dirname(__file__), ".."))

# Load env from parent directory
load_dotenv(os.path.join(os.path.dirname(__file__), "../../.env"))

from app.services.llm_service import LLMService, GeminiProvider

async def test_gemini_thinking():
    print("--- Testing Gemini 3 Thinking Mode ---")
    
    provider = GeminiProvider()
    
    # Test 1: Simple thought generation
    prompt = "Explain why 3+3=6 in a philosophical way."
    print(f"Prompt: {prompt}")
    
    try:
        response = await provider.complete(
            prompt,
            thinking_level="low",
            max_tokens=1000
        )
        
        print("\nResponse Text (First 100 chars):", response["text"][:100] + "...")
        print("\nThoughts captured:", "YES" if response.get("thoughts") else "NO")
        if response.get("thoughts"):
            print("Thoughts (First 100 chars):", response["thoughts"][:100] + "...")
            
        print("\nThought Signature captured:", "YES" if response.get("thought_signature") else "NO")
        if response.get("thought_signature"):
            print("Signature:", response["thought_signature"][:50] + "...")
            
    except Exception as e:
        print(f"FAILED: {e}")

async def test_chat_history_objects():
    print("\n--- Testing Chat History Objects ---")
    provider = GeminiProvider()
    
    # Simulate history
    history = [
        {"role": "user", "parts": [{"text": "My name is Robin."}]},
        {"role": "model", "parts": [{"text": "Hello Robin! nice to meet you."}]}
    ]
    
    prompt = "What is my name?"
    print(f"History: {history}")
    print(f"Prompt: {prompt}")
    
    try:
        response = await provider.complete(
            prompt,
            messages=history,
            thinking_level="off"
        )
        print("\nResponse:", response["text"])
        if "Robin" in response["text"]:
            print("SUCCESS: Context retained.")
        else:
            print("FAILURE: Context lost.")
            
    except Exception as e:
        print(f"FAILED: {e}")

if __name__ == "__main__":
    asyncio.run(test_gemini_thinking())
    asyncio.run(test_chat_history_objects())
