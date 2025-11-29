API Implementation Guide
Complete Reference for Image Generation, LLM, TTS, and Stock Video APIs
Table of Contents
Overview
Image Generation APIs
Gemini Image Models
OpenRouter Image Models
Large Language Model APIs
Gemini LLM Models
OpenRouter LLM Models
LLM Script Analysis
Text-to-Speech APIs
Genai Pro TTS
AI33 Pro TTS
Gemini TTS Models
Stock Video APIs
Storyblocks API
Pexels API
Integration Workflow
Best Practices & Tips
Appendix
Overview
This comprehensive guide provides detailed implementation instructions for integrating multiple AI and media APIs into your applications. The documentation covers four main categories of services:

Image Generation: Generate high-quality images using Gemini's advanced models including Imagen 4, Imagen 4 Ultra, and Nano Banana series
Large Language Models: Access powerful text generation capabilities through Gemini 2.5 Flash and Pro models
Text-to-Speech: Convert text to natural-sounding audio with multiple voice options
Stock Video: Search and retrieve relevant video content from Storyblocks and Pexels
Note: All code examples in this guide include proper error handling, authentication, and follow industry best practices. Make sure to secure your API keys and follow rate limiting guidelines.
Image Generation APIs
Gemini API - Image Models
Available Models
gemini-2.5-flash-image - Fast image generation (Nano Banana)
gemini-3-pro-image - Advanced image generation (Nano Banana Pro)
imagen-4 - High-quality image generation
imagen-4-ultra - Ultra high-quality image generation
Authentication Setup
Get your API key from Google AI Studio

POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent
Python Implementation
from google import genai
from google.genai import types
from PIL import Image
from io import BytesIO
import os

# Initialize the client
client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

def generate_image(prompt, model="gemini-2.5-flash-image", aspect_ratio="1:1"):
    """
    Generate an image using Gemini API
    
    Args:
        prompt (str): Description of the image to generate
        model (str): Model to use for generation
        aspect_ratio (str): Desired aspect ratio (1:1, 16:9, 9:16, etc.)
    
    Returns:
        PIL.Image: Generated image
    """
    try:
        response = client.models.generate_content(
            model=model,
            contents=[prompt],
            config=types.GenerateContentConfig(
                image_config=types.ImageConfig(
                    aspect_ratio=aspect_ratio
                )
            )
        )
        
        # Extract image data
        for part in response.candidates[0].content.parts:
            if part.inline_data is not None:
                image_data = part.inline_data.data
                image = Image.open(BytesIO(image_data))
                return image
                
    except Exception as e:
        print(f"Error generating image: {e}")
        return None

# Example usage
prompt = "A futuristic cityscape at sunset with flying cars"
image = generate_image(prompt, aspect_ratio="16:9")
if image:
    image.save("generated_cityscape.png")
    print("Image saved successfully!")
JavaScript/Node.js Implementation
import { GoogleGenAI } from '@google/genai';
import fs from 'fs';

class GeminiImageGenerator {
    constructor(apiKey) {
        this.ai = new GoogleGenAI({ apiKey });
    }

    async generateImage(prompt, options = {}) {
        const {
            model = "gemini-2.5-flash-image",
            aspectRatio = "1:1",
            outputPath = "generated_image.png"
        } = options;

        try {
            const response = await this.ai.models.generateContent({
                model: model,
                contents: [{ parts: [{ text: prompt }] }],
                config: {
                    imageConfig: {
                        aspectRatio: aspectRatio
                    }
                }
            });

            // Extract and save image
            for (const part of response.candidates[0].content.parts) {
                if (part.inlineData) {
                    const imageData = part.inlineData.data;
                    const buffer = Buffer.from(imageData, 'base64');
                    fs.writeFileSync(outputPath, buffer);
                    console.log(`Image saved to ${outputPath}`);
                    return buffer;
                }
            }
        } catch (error) {
            console.error('Error generating image:', error);
            throw error;
        }
    }
}

// Usage example
const generator = new GeminiImageGenerator(process.env.GEMINI_API_KEY);
await generator.generateImage(
    "A serene mountain landscape with a crystal clear lake",
    { aspectRatio: "16:9", outputPath: "mountain_lake.png" }
);
cURL Example
curl -X POST \
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent" \
  -H "x-goog-api-key: $GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "contents": [{
      "parts": [{
        "text": "A magical forest with glowing mushrooms and fireflies"
      }]
    }],
    "generationConfig": {
      "imageConfig": {
        "aspectRatio": "1:1"
      }
    }
  }' | jq -r '.candidates[0].content.parts[0].inlineData.data' | base64 -d > magical_forest.png
Supported Aspect Ratios
Aspect Ratio	Resolution	Use Case
1:1	1024×1024	Square images, social media
16:9	1344×768	Widescreen, presentations
9:16	768×1344	Mobile, vertical content
4:3	1184×864	Traditional photos
3:4	864×1184	Portrait orientation
OpenRouter API - Image Models
POST https://openrouter.ai/api/v1/chat/completions
Python Implementation
import requests
import json
import base64
from typing import Optional, Dict, Any

class OpenRouterImageGenerator:
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.base_url = "https://openrouter.ai/api/v1"
        self.headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }

    def get_image_models(self) -> list:
        """Get list of available image generation models"""
        response = requests.get(f"{self.base_url}/models", headers=self.headers)
        models = response.json()
        
        # Filter for image generation models
        image_models = [
            model for model in models['data'] 
            if 'image' in model.get('output_modalities', [])
        ]
        return image_models

    def generate_image(self, prompt: str, model: str = None) -> Optional[str]:
        """
        Generate image using OpenRouter
        
        Args:
            prompt (str): Image description prompt
            model (str): Model to use (optional, will auto-select if None)
        
        Returns:
            str: Base64 encoded image data
        """
        # Auto-select model if not specified
        if not model:
            models = self.get_image_models()
            model = models[0]['id'] if models else "black-forest-labs/flux.2-pro"

        data = {
            "model": model,
            "messages": [
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            "modalities": ["image", "text"]
        }

        try:
            response = requests.post(
                f"{self.base_url}/chat/completions",
                headers=self.headers,
                json=data
            )
            
            if response.status_code == 200:
                result = response.json()
                
                # Extract image from response
                if 'images' in result.get('choices', [{}])[0].get('message', {}):
                    images = result['choices'][0]['message']['images']
                    if images:
                        # Return base64 data from data URL
                        return images[0].split(',')[1]  # Remove data:image/png;base64, prefix
            else:
                print(f"Error: {response.status_code} - {response.text}")
                
        except Exception as e:
            print(f"Error generating image: {e}")
            
        return None

# Usage example
generator = OpenRouterImageGenerator(os.getenv("OPENROUTER_API_KEY"))

# Generate image
image_b64 = generator.generate_image(
    "A cyberpunk street scene with neon lights and rain",
    model="black-forest-labs/flux.2-pro"
)

if image_b64:
    # Save image
    with open("cyberpunk_street.png", "wb") as f:
        f.write(base64.b64decode(image_b64))
    print("Image saved successfully!")
Large Language Model APIs
Gemini API - LLM Models
Available Models
gemini-2.5-flash - Fast, balanced performance (1M token context)
gemini-2.5-pro - Advanced reasoning and analysis (1M token context)
Python Implementation with Streaming
from google import genai
import os

class GeminiLLM:
    def __init__(self, api_key: str):
        self.client = genai.Client(api_key=api_key)
    
    def generate_text(self, prompt: str, model: str = "gemini-2.5-flash", stream: bool = False):
        """
        Generate text using Gemini LLM
        
        Args:
            prompt (str): Input prompt
            model (str): Model to use
            stream (bool): Enable streaming response
        """
        try:
            response = self.client.models.generate_content(
                model=model,
                contents=[prompt],
                config={
                    "temperature": 0.7,
                    "max_output_tokens": 2048
                }
            )
            
            if stream:
                # Streaming response
                for chunk in response:
                    if chunk.text:
                        print(chunk.text, end='', flush=True)
                        yield chunk.text
            else:
                # Complete response
                return response.candidates[0].content.parts[0].text
                
        except Exception as e:
            print(f"Error generating text: {e}")
            return None
    
    def analyze_content(self, content: str, analysis_type: str = "summary"):
        """
        Analyze content using Gemini
        
        Args:
            content (str): Content to analyze
            analysis_type (str): Type of analysis (summary, keywords, sentiment)
        """
        prompts = {
            "summary": f"Provide a concise summary of the following content:\n\n{content}",
            "keywords": f"Extract the main keywords and key phrases from this content:\n\n{content}",
            "sentiment": f"Analyze the sentiment and tone of this content:\n\n{content}",
            "script_analysis": f"""
            Analyze this video script and extract:
            1. Main themes and topics
            2. Key visual elements mentioned
            3. Mood and tone
            4. Keywords for stock video search
            
            Script: {content}
            """
        }
        
        prompt = prompts.get(analysis_type, prompts["summary"])
        return self.generate_text(prompt, model="gemini-2.5-pro")

# Usage example
llm = GeminiLLM(os.getenv("GEMINI_API_KEY"))

# Generate text
response = llm.generate_text(
    "Explain quantum computing in simple terms",
    model="gemini-2.5-flash"
)
print(response)

# Analyze script for video production
script = """
FADE IN: A busy city street at dawn. The camera pans across 
sleepy commuters beginning their day. Coffee shops open their 
doors as the first rays of sunlight pierce through tall buildings.
"""

analysis = llm.analyze_content(script, "script_analysis")
print(analysis)
OpenRouter API - Multiple LLMs
Python Implementation
import requests
import json
from typing import Generator, Optional

class OpenRouterLLM:
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.base_url = "https://openrouter.ai/api/v1"
        self.headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }

    def get_models(self) -> list:
        """Get list of available models"""
        response = requests.get(f"{self.base_url}/models", headers=self.headers)
        return response.json()['data']

    def generate_text(self, prompt: str, model: str = "openai/gpt-4", 
                     max_tokens: int = 2048, temperature: float = 0.7,
                     stream: bool = False) -> str:
        """
        Generate text using OpenRouter
        
        Args:
            prompt (str): Input prompt
            model (str): Model to use
            max_tokens (int): Maximum tokens to generate
            temperature (float): Creativity level (0-1)
            stream (bool): Enable streaming
        """
        data = {
            "model": model,
            "messages": [
                {"role": "user", "content": prompt}
            ],
            "max_tokens": max_tokens,
            "temperature": temperature,
            "stream": stream
        }

        try:
            response = requests.post(
                f"{self.base_url}/chat/completions",
                headers=self.headers,
                json=data,
                stream=stream
            )

            if stream:
                return self._handle_stream(response)
            else:
                result = response.json()
                return result['choices'][0]['message']['content']
                
        except Exception as e:
            print(f"Error: {e}")
            return None

    def _handle_stream(self, response) -> Generator[str, None, None]:
        """Handle streaming response"""
        for line in response.iter_lines():
            if line:
                line = line.decode('utf-8')
                if line.startswith('data: '):
                    data = line[6:]  # Remove 'data: ' prefix
                    if data == '[DONE]':
                        break
                    try:
                        json_data = json.loads(data)
                        content = json_data['choices'][0]['delta'].get('content', '')
                        if content:
                            yield content
                    except json.JSONDecodeError:
                        continue

    def compare_models(self, prompt: str, models: list) -> dict:
        """Compare responses from multiple models"""
        results = {}
        for model in models:
            print(f"Testing {model}...")
            response = self.generate_text(prompt, model=model)
            results[model] = response
        return results

# Usage example
llm = OpenRouterLLM(os.getenv("OPENROUTER_API_KEY"))

# List available models
models = llm.get_models()
text_models = [m['id'] for m in models if 'chat' in m.get('capabilities', [])]
print(f"Available models: {text_models[:5]}")  # Show first 5

# Generate text
response = llm.generate_text(
    "Write a creative story about AI and humanity",
    model="anthropic/claude-3-sonnet",
    temperature=0.8
)
print(response)

# Compare multiple models
comparison = llm.compare_models(
    "Explain machine learning in one paragraph",
    ["openai/gpt-4", "anthropic/claude-3-sonnet", "google/gemini-pro"]
)
for model, response in comparison.items():
    print(f"\n{model}:\n{response}")
LLM Script Analysis
Use Gemini 2.5 Flash Preview for analyzing video scripts and extracting keywords for stock video searches.

import re
from typing import Dict, List

class ScriptAnalyzer:
    def __init__(self, gemini_client):
        self.client = gemini_client
    
    def analyze_script(self, script: str) -> Dict:
        """
        Comprehensive script analysis for video production
        
        Args:
            script (str): Video script content
            
        Returns:
            Dict: Analysis results with keywords, scenes, mood, etc.
        """
        analysis_prompt = f"""
        Analyze this video script and provide a structured analysis:

        SCRIPT:
        {script}

        Please provide:
        1. VISUAL_KEYWORDS: List of specific visual elements, objects, locations, and scenes
        2. MOOD_TONE: Overall emotional tone and atmosphere
        3. KEY_THEMES: Main topics and themes
        4. SCENE_BREAKDOWN: List of distinct scenes or shots
        5. STOCK_VIDEO_QUERIES: Specific search terms for finding relevant stock footage
        6. COLOR_PALETTE: Suggested color schemes based on the mood
        7. PACING: Suggested video pacing (slow, moderate, fast)

        Format your response as structured data that can be parsed.
        """
        
        try:
            response = self.client.models.generate_content(
                model="gemini-2.5-flash",
                contents=[analysis_prompt]
            )
            
            analysis_text = response.candidates[0].content.parts[0].text
            return self._parse_analysis(analysis_text)
            
        except Exception as e:
            print(f"Error analyzing script: {e}")
            return {}
    
    def _parse_analysis(self, analysis_text: str) -> Dict:
        """Parse the structured analysis response"""
        # Simple parsing logic - in production, use more robust parsing
        analysis = {}
        
        sections = {
            'VISUAL_KEYWORDS': [],
            'MOOD_TONE': '',
            'KEY_THEMES': [],
            'SCENE_BREAKDOWN': [],
            'STOCK_VIDEO_QUERIES': [],
            'COLOR_PALETTE': '',
            'PACING': ''
        }
        
        current_section = None
        for line in analysis_text.split('\n'):
            line = line.strip()
            
            # Check for section headers
            for section in sections.keys():
                if section in line.upper():
                    current_section = section
                    break
            
            # Extract content for current section
            if current_section and line and not any(s in line.upper() for s in sections.keys()):
                if current_section in ['VISUAL_KEYWORDS', 'KEY_THEMES', 'SCENE_BREAKDOWN', 'STOCK_VIDEO_QUERIES']:
                    # List items
                    if line.startswith(('•', '-', '*')) or line[0].isdigit():
                        cleaned_line = re.sub(r'^[\d\.\-\*\•\s]+', '', line)
                        if cleaned_line:
                            sections[current_section].append(cleaned_line)
                else:
                    # String items
                    if sections[current_section]:
                        sections[current_section] += ' ' + line
                    else:
                        sections[current_section] = line
        
        return sections
    
    def generate_stock_queries(self, analysis: Dict) -> List[str]:
        """
        Generate optimized stock video search queries
        
        Args:
            analysis (Dict): Script analysis results
            
        Returns:
            List[str]: Optimized search queries
        """
        queries = []
        
        # Use visual keywords
        visual_keywords = analysis.get('VISUAL_KEYWORDS', [])
        mood_tone = analysis.get('MOOD_TONE', '').lower()
        
        # Combine keywords with mood descriptors
        mood_descriptors = {
            'happy': ['bright', 'cheerful', 'sunny', 'vibrant'],
            'sad': ['melancholy', 'somber', 'gray', 'moody'],
            'dramatic': ['cinematic', 'intense', 'powerful'],
            'peaceful': ['serene', 'calm', 'tranquil', 'gentle'],
            'energetic': ['dynamic', 'active', 'fast-paced']
        }
        
        # Generate base queries from visual keywords
        for keyword in visual_keywords[:10]:  # Limit to top 10
            queries.append(keyword.lower().strip())
        
        # Add mood-enhanced queries
        for mood, descriptors in mood_descriptors.items():
            if mood in mood_tone:
                for keyword in visual_keywords[:5]:  # Top 5 with mood
                    for descriptor in descriptors[:2]:  # Top 2 descriptors
                        queries.append(f"{descriptor} {keyword.lower().strip()}")
        
        # Add scene-specific queries
        scenes = analysis.get('SCENE_BREAKDOWN', [])
        for scene in scenes[:5]:  # Top 5 scenes
            queries.append(scene.lower().strip())
        
        return list(set(queries))  # Remove duplicates

# Usage example
from google import genai

# Initialize
client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
analyzer = ScriptAnalyzer(client)

# Sample script
sample_script = """
FADE IN: A bustling coffee shop in the morning. Steam rises from 
freshly brewed coffee as customers rush to start their day. 
SARAH, a young entrepreneur, sits at a corner table with her laptop, 
deep in concentration.

The camera pans to show the urban landscape outside - tall buildings 
reaching toward a cloudy sky, people walking briskly on sidewalks.

SARAH (V.O.)
Every great journey begins with a single step...
"""

# Analyze script
analysis = analyzer.analyze_script(sample_script)
print("Script Analysis:")
for key, value in analysis.items():
    print(f"\n{key}: {value}")

# Generate stock video queries
queries = analyzer.generate_stock_queries(analysis)
print(f"\nStock Video Queries:")
for i, query in enumerate(queries[:10], 1):
    print(f"{i}. {query}")
Text-to-Speech APIs
Genai Pro API
Note: Genai Pro API documentation is limited in the search results. Please refer to the official Genai Pro documentation for detailed implementation. Below is a general implementation pattern.
import requests
import base64

class GenaiProTTS:
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.base_url = "https://api.genai.pro/v1"  # Placeholder URL
        self.headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
    
    def get_voices(self) -> list:
        """Get available voices"""
        response = requests.get(f"{self.base_url}/voices", headers=self.headers)
        return response.json()
    
    def text_to_speech(self, text: str, voice: str = "default", 
                      speed: float = 1.0, pitch: float = 1.0) -> bytes:
        """
        Convert text to speech
        
        Args:
            text (str): Text to convert
            voice (str): Voice ID to use
            speed (float): Speech speed (0.5-2.0)
            pitch (float): Voice pitch (0.5-2.0)
            
        Returns:
            bytes: Audio data
        """
        data = {
            "text": text,
            "voice": voice,
            "speed": speed,
            "pitch": pitch,
            "format": "mp3"
        }
        
        response = requests.post(
            f"{self.base_url}/synthesize",
            headers=self.headers,
            json=data
        )
        
        if response.status_code == 200:
            return response.content
        else:
            raise Exception(f"TTS Error: {response.text}")

# Usage example (adjust according to actual API)
# tts = GenaiProTTS(os.getenv("GENAI_PRO_API_KEY"))
# audio_data = tts.text_to_speech("Hello world", voice="female_voice_1")
# with open("output.mp3", "wb") as f:
#     f.write(audio_data)
AI33 Pro API
Note: AI33 Pro API was not found in the search results. Please refer to the official AI33 Pro documentation. Below is a general implementation template.
import requests
from typing import Optional

class AI33ProTTS:
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.base_url = "https://api.ai33.pro/v1"  # Placeholder URL
        self.headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
    
    def synthesize_speech(self, text: str, voice_id: str = "default", 
                         language: str = "en-US") -> Optional[bytes]:
        """
        Synthesize speech from text
        
        Args:
            text (str): Input text
            voice_id (str): Voice identifier
            language (str): Language code
            
        Returns:
            bytes: Audio data or None if error
        """
        payload = {
            "text": text,
            "voice_id": voice_id,
            "language": language,
            "audio_format": "mp3"
        }
        
        try:
            response = requests.post(
                f"{self.base_url}/tts",
                headers=self.headers,
                json=payload
            )
            
            if response.status_code == 200:
                return response.content
            else:
                print(f"Error: {response.status_code} - {response.text}")
                return None
                
        except Exception as e:
            print(f"TTS Error: {e}")
            return None

# Usage template
# tts = AI33ProTTS(os.getenv("AI33_PRO_API_KEY"))
# audio = tts.synthesize_speech("Hello world", voice_id="premium_voice_1")
Gemini TTS Models
Available Models
gemini-2.5-flash-preview-tts - Fast TTS generation
gemini-2.5-pro-preview-tts - Advanced TTS with better quality
30 Available Voices
Voice Options: Zephyr (Bright), Puck (Upbeat), Charon (Informative), Kore (Firm), Fenrir (Excitable), Leda (Youthful), Orus (Firm), Aoede (Breezy), Callirhoe (Easy-going), Autonoe (Bright), Enceladus (Breathy), Iapetus (Clear), Umbriel (Easy-going), Algieba (Smooth), Despina (Smooth), Erinome (Clear), Algenib (Gravelly), Rasalgethi (Informative), Laomedeia (Upbeat), Achernar (Soft), Alnilam (Firm), Schedar (Even), Gacrux (Mature), Pulcherrima (Forward), Achird (Friendly), Zubenelgenubi (Casual), Vindemiatrix (Gentle), Sadachbia (Lively), Sadaltager (Knowledgeable), Sulafar (Warm)

Single-Speaker TTS
from google import genai
from google.genai import types
import wave
import os

class GeminiTTS:
    def __init__(self, api_key: str):
        self.client = genai.Client(api_key=api_key)
    
    def save_wave_file(self, filename: str, pcm_data: bytes, 
                      channels: int = 1, rate: int = 24000, sample_width: int = 2):
        """Save PCM data as WAV file"""
        with wave.open(filename, "wb") as wf:
            wf.setnchannels(channels)
            wf.setsampwidth(sample_width)
            wf.setframerate(rate)
            wf.writeframes(pcm_data)
    
    def text_to_speech_single(self, text: str, voice_name: str = "Kore", 
                            model: str = "gemini-2.5-flash-preview-tts",
                            output_file: str = "output.wav") -> bool:
        """
        Generate single-speaker TTS
        
        Args:
            text (str): Text to convert to speech
            voice_name (str): Voice to use (e.g., 'Kore', 'Puck', 'Zephyr')
            model (str): TTS model to use
            output_file (str): Output filename
            
        Returns:
            bool: Success status
        """
        try:
            response = self.client.models.generate_content(
                model=model,
                contents=text,
                config=types.GenerateContentConfig(
                    response_modalities=["AUDIO"],
                    speech_config=types.SpeechConfig(
                        voice_config=types.VoiceConfig(
                            prebuilt_voice_config=types.PrebuiltVoiceConfig(
                                voice_name=voice_name
                            )
                        )
                    )
                )
            )
            
            # Extract audio data
            audio_data = response.candidates[0].content.parts[0].inline_data.data
            
            # Save as WAV file
            self.save_wave_file(output_file, audio_data)
            print(f"Audio saved to {output_file}")
            return True
            
        except Exception as e:
            print(f"TTS Error: {e}")
            return False
    
    def text_to_speech_multi(self, script: str, speaker_configs: list, 
                           model: str = "gemini-2.5-flash-preview-tts",
                           output_file: str = "multi_speaker.wav") -> bool:
        """
        Generate multi-speaker TTS
        
        Args:
            script (str): Script with speaker labels
            speaker_configs (list): List of speaker configurations
            model (str): TTS model to use
            output_file (str): Output filename
            
        Returns:
            bool: Success status
        """
        try:
            # Build speaker voice configs
            speaker_voice_configs = []
            for config in speaker_configs:
                speaker_voice_configs.append(
                    types.SpeakerVoiceConfig(
                        speaker=config['speaker'],
                        voice_config=types.VoiceConfig(
                            prebuilt_voice_config=types.PrebuiltVoiceConfig(
                                voice_name=config['voice_name']
                            )
                        )
                    )
                )
            
            response = self.client.models.generate_content(
                model=model,
                contents=script,
                config=types.GenerateContentConfig(
                    response_modalities=["AUDIO"],
                    speech_config=types.SpeechConfig(
                        multi_speaker_voice_config=types.MultiSpeakerVoiceConfig(
                            speaker_voice_configs=speaker_voice_configs
                        )
                    )
                )
            )
            
            # Extract and save audio
            audio_data = response.candidates[0].content.parts[0].inline_data.data
            self.save_wave_file(output_file, audio_data)
            print(f"Multi-speaker audio saved to {output_file}")
            return True
            
        except Exception as e:
            print(f"Multi-speaker TTS Error: {e}")
            return False

# Usage examples
tts = GeminiTTS(os.getenv("GEMINI_API_KEY"))

# Single speaker
success = tts.text_to_speech_single(
    "Welcome to our comprehensive API guide. This documentation will help you integrate multiple AI services.",
    voice_name="Kore",
    output_file="welcome.wav"
)

# Multi-speaker conversation
conversation_script = """
TTS the following conversation between Alice and Bob:
Alice: How's the new API integration going?
Bob: It's going well! The documentation is really comprehensive.
Alice: That's great to hear. Which APIs are you using?
Bob: We're using Gemini for text generation and image creation, plus some TTS models.
"""

speaker_configs = [
    {"speaker": "Alice", "voice_name": "Leda"},  # Youthful voice
    {"speaker": "Bob", "voice_name": "Kore"}    # Firm voice
]

success = tts.text_to_speech_multi(
    conversation_script,
    speaker_configs,
    output_file="conversation.wav"
)
Supported Languages (24 Languages)
Language	Code	Language	Code
Arabic (Egyptian)	ar-EG	German (Germany)	de-DE
English (US)	en-US	Spanish (US)	es-US
French (France)	fr-FR	Hindi (India)	hi-IN
Indonesian	id-ID	Italian (Italy)	it-IT
Japanese (Japan)	ja-JP	Korean (Korea)	ko-KR
Portuguese (Brazil)	pt-BR	Russian (Russia)	ru-RU
Dutch (Netherlands)	nl-NL	Polish (Poland)	pl-PL
Thai (Thailand)	th-TH	Turkish (Turkey)	tr-TR
Vietnamese	vi-VN	Romanian	ro-RO
Ukrainian	uk-UA	Bengali	bn-BD
Marathi (India)	mr-IN	Tamil (India)	ta-IN
Telugu (India)	te-IN	English (India)	en-IN
Stock Video APIs
Storyblocks API
GET https://api.storyblocks.com/api/v2/videos/search
Authentication: Storyblocks uses HMAC authentication with public/secret key pairs. Contact enterprise@storyblocks.com for API access.
Python Implementation
import hashlib
import hmac
import time
import requests
from urllib.parse import urlencode, quote
from typing import Dict, List, Optional

class StoryblocksAPI:
    def __init__(self, public_key: str, secret_key: str):
        self.public_key = public_key
        self.secret_key = secret_key
        self.base_url = "https://api.storyblocks.com/api/v2"
    
    def _generate_hmac(self, resource: str, expires: int) -> str:
        """Generate HMAC for authentication"""
        key = self.secret_key + str(expires)
        signature = hmac.new(
            key.encode('utf-8'), 
            resource.encode('utf-8'), 
            hashlib.sha256
        ).hexdigest()
        return signature
    
    def _build_auth_params(self, resource: str) -> Dict[str, str]:
        """Build authentication parameters"""
        expires = int(time.time()) + 3600  # 1 hour from now
        hmac_signature = self._generate_hmac(resource, expires)
        
        return {
            'APIKEY': self.public_key,
            'EXPIRES': str(expires),
            'HMAC': hmac_signature
        }
    
    def search_videos(self, query: str, user_id: str, project_id: str,
                     page: int = 1, per_page: int = 20, 
                     duration_min: int = None, duration_max: int = None,
                     orientation: str = None, resolution: str = None) -> Optional[Dict]:
        """
        Search for videos on Storyblocks
        
        Args:
            query (str): Search query
            user_id (str): Unique user identifier
            project_id (str): Unique project identifier
            page (int): Page number (default: 1)
            per_page (int): Results per page (default: 20, max: 50)
            duration_min (int): Minimum duration in seconds
            duration_max (int): Maximum duration in seconds
            orientation (str): 'landscape', 'portrait', or 'square'
            resolution (str): 'hd', '4k', etc.
            
        Returns:
            Dict: Search results or None if error
        """
        # Build query parameters
        params = {
            'query': query,
            'user_id': user_id,
            'project_id': project_id,
            'page': page,
            'per_page': per_page
        }
        
        # Add optional parameters
        if duration_min:
            params['duration_min'] = duration_min
        if duration_max:
            params['duration_max'] = duration_max
        if orientation:
            params['orientation'] = orientation
        if resolution:
            params['resolution'] = resolution
        
        # Build resource path for HMAC
        resource = f"/api/v2/videos/search?{urlencode(params)}"
        
        # Add authentication parameters
        auth_params = self._build_auth_params(resource)
        params.update(auth_params)
        
        # Make request
        try:
            response = requests.get(
                f"{self.base_url}/videos/search",
                params=params,
                timeout=30
            )
            
            if response.status_code == 200:
                return response.json()
            else:
                print(f"Error {response.status_code}: {response.text}")
                return None
                
        except Exception as e:
            print(f"Request error: {e}")
            return None
    
    def get_video_details(self, video_id: str, user_id: str, project_id: str) -> Optional[Dict]:
        """Get detailed information about a specific video"""
        resource = f"/api/v2/videos/{video_id}"
        auth_params = self._build_auth_params(resource)
        
        params = {
            'user_id': user_id,
            'project_id': project_id,
            **auth_params
        }
        
        try:
            response = requests.get(
                f"{self.base_url}/videos/{video_id}",
                params=params,
                timeout=30
            )
            
            if response.status_code == 200:
                return response.json()
            else:
                print(f"Error {response.status_code}: {response.text}")
                return None
                
        except Exception as e:
            print(f"Request error: {e}")
            return None

# Usage example
api = StoryblocksAPI(
    public_key=os.getenv("STORYBLOCKS_PUBLIC_KEY"),
    secret_key=os.getenv("STORYBLOCKS_SECRET_KEY")
)

# Search for videos
results = api.search_videos(
    query="coffee shop morning",
    user_id="user_123",
    project_id="project_456",
    duration_min=5,
    duration_max=30,
    orientation="landscape"
)

if results:
    print(f"Found {results.get('total', 0)} videos")
    for video in results.get('videos', []):
        print(f"- {video['title']} ({video['duration']}s)")
        print(f"  Preview: {video['preview_url']}")
        print(f"  Download: {video['download_url']}")
Pexels API
GET https://api.pexels.com/videos/search
Python Implementation
import requests
from typing import Dict, List, Optional

class PexelsVideoAPI:
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.base_url = "https://api.pexels.com"
        self.headers = {
            "Authorization": api_key
        }
    
    def search_videos(self, query: str, orientation: str = None, 
                     size: str = None, page: int = 1, per_page: int = 15) -> Optional[Dict]:
        """
        Search for videos on Pexels
        
        Args:
            query (str): Search query
            orientation (str): 'landscape', 'portrait', or 'square'
            size (str): 'large' (HD), 'medium' (SD), or 'small'
            page (int): Page number
            per_page (int): Results per page (max: 80)
            
        Returns:
            Dict: Search results or None if error
        """
        params = {
            'query': query,
            'page': page,
            'per_page': min(per_page, 80)  # Max 80 per page
        }
        
        if orientation:
            params['orientation'] = orientation
        if size:
            params['size'] = size
        
        try:
            response = requests.get(
                f"{self.base_url}/videos/search",
                headers=self.headers,
                params=params,
                timeout=30
            )
            
            if response.status_code == 200:
                return response.json()
            elif response.status_code == 429:
                print("Rate limit exceeded. Please wait before making more requests.")
                return None
            else:
                print(f"Error {response.status_code}: {response.text}")
                return None
                
        except Exception as e:
            print(f"Request error: {e}")
            return None
    
    def get_popular_videos(self, page: int = 1, per_page: int = 15) -> Optional[Dict]:
        """Get popular/curated videos"""
        params = {
            'page': page,
            'per_page': min(per_page, 80)
        }
        
        try:
            response = requests.get(
                f"{self.base_url}/videos/popular",
                headers=self.headers,
                params=params,
                timeout=30
            )
            
            if response.status_code == 200:
                return response.json()
            else:
                print(f"Error {response.status_code}: {response.text}")
                return None
                
        except Exception as e:
            print(f"Request error: {e}")
            return None
    
    def get_video_by_id(self, video_id: int) -> Optional[Dict]:
        """Get specific video by ID"""
        try:
            response = requests.get(
                f"{self.base_url}/videos/videos/{video_id}",
                headers=self.headers,
                timeout=30
            )
            
            if response.status_code == 200:
                return response.json()
            else:
                print(f"Error {response.status_code}: {response.text}")
                return None
                
        except Exception as e:
            print(f"Request error: {e}")
            return None
    
    def download_video(self, video_url: str, filename: str) -> bool:
        """Download video file"""
        try:
            response = requests.get(video_url, stream=True, timeout=60)
            
            if response.status_code == 200:
                with open(filename, 'wb') as f:
                    for chunk in response.iter_content(chunk_size=8192):
                        f.write(chunk)
                print(f"Video downloaded: {filename}")
                return True
            else:
                print(f"Download failed: {response.status_code}")
                return False
                
        except Exception as e:
            print(f"Download error: {e}")
            return False
    
    def search_multiple_queries(self, queries: List[str], max_per_query: int = 10) -> Dict[str, List]:
        """
        Search multiple queries and return organized results
        
        Args:
            queries (List[str]): List of search queries
            max_per_query (int): Maximum results per query
            
        Returns:
            Dict[str, List]: Results organized by query
        """
        all_results = {}
        
        for query in queries:
            print(f"Searching for: {query}")
            results = self.search_videos(query, per_page=max_per_query)
            
            if results and results.get('videos'):
                all_results[query] = results['videos']
                print(f"Found {len(results['videos'])} videos for '{query}'")
            else:
                all_results[query] = []
                print(f"No videos found for '{query}'")
            
            # Small delay to respect rate limits
            time.sleep(0.5)
        
        return all_results

# Usage example
pexels = PexelsVideoAPI(os.getenv("PEXELS_API_KEY"))

# Search for videos
results = pexels.search_videos(
    query="coffee shop morning busy",
    orientation="landscape",
    size="large",
    per_page=20
)

if results:
    print(f"Total results: {results['total_results']}")
    print(f"Page {results['page']} of {results['total_results'] // results['per_page'] + 1}")
    
    for video in results['videos']:
        print(f"\nTitle: {video.get('user', {}).get('name', 'Unknown')} - Video {video['id']}")
        print(f"Duration: {video['duration']} seconds")
        print(f"Dimensions: {video['width']}x{video['height']}")
        print(f"Preview: {video['image']}")
        
        # Show available video files
        if video['video_files']:
            print("Available formats:")
            for file_info in video['video_files']:
                print(f"  - {file_info['quality']} ({file_info['width']}x{file_info['height']}) - {file_info['file_type']}")
                print(f"    URL: {file_info['link']}")

# Search multiple queries (useful for script analysis results)
script_keywords = [
    "coffee shop morning",
    "urban cityscape",
    "busy professionals",
    "laptop working"
]

multi_results = pexels.search_multiple_queries(script_keywords, max_per_query=5)

for query, videos in multi_results.items():
    print(f"\n=== Results for '{query}' ===")
    for video in videos[:3]:  # Show top 3
        print(f"- Video {video['id']} ({video['duration']}s)")
Rate Limits: Pexels API allows 200 requests per hour and 20,000 per month by default. Contact Pexels for higher limits if needed.
Integration Workflow Example
Complete workflow demonstrating how to integrate script analysis, TTS generation, and stock video retrieval:

>
      