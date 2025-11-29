Create Speech
Converts text into speech using a voice of your choice and returns audio.
Request

curl -X POST "https://api.ai33.pro/v1/text-to-speech/$voice_id?output_format=mp3_44100_128" \
  -H "Content-Type: application/json" \
  -H "xi-api-key: $API_KEY" \
  -d '{
  "text": "The first move is what sets everything in motion.",
  "model_id": "eleven_multilingual_v2",
  "with_transcript": false, // Optional, if you want to get the transcript of the audio
  "receive_url": "http://your-webhook-endpoint" // Optional, if you want to receive the audio file via webhook.
}'
Success Response Example
{
  "success": true,
  "task_id": uuid_task_id,
  "ec_remain_credits": int_credits_remain
}
Request we POST to your webhook endpoint; or you can polling the Common / GET Task
{
  "id": "uuid_task_id",
  "created_at": "2025-01-01T00:00:00.000Z",
  "status": "done",
  "error_message": null,
  "credit_cost": 1,
  "metadata": {
    "audio_url": "https://example.com/audio.mp3",
    "srt_url": "https://example.com/audio.srt",
    "json_url": "https://example.com/audio.json",
    // ...each task type has different metadata
  },
  "type": "tts"
}
Read Elevenlabs documentation for details (as Free user)
Dub an audio file
Dubs a provided audio file into given language. Returns dubbed audio & transcript (srt).
Request

curl -X POST "https://api.ai33.pro/v1/task/dubbing" \
  -H "xi-api-key: $API_KEY" \
  -H "Content-Type: multipart/form-data" \
  -F file=@<file1> \
  -F num_speakers="0" \
  -F disable_voice_cloning="false" \
  -F source_lang="auto" \
  -F target_lang=$target_lang \
  -F receive_url="http://your-webhook-endpoint"
file: File only accept audio.m4a, audio.mp3 (Max: 20MB or 5 minutes)
num_speakers: int Default: 0. Number of speakers to use for the dubbing. Set to 0 to automatically detect the number of speakers
disable_voice_cloning: boolean Default: true. [BETA] Instead of using a voice clone in dubbing, use a similar voice from the ElevenLabs Voice Library.
source_lang: string
Default: "auto" - auto detect.
target_lang: string
The Target language to dub the content into.
receive_url: string We will send the POST request to your webhook endpoint with the audio and transcript file when done.
Success Response Example
{
    "success": true,
    "task_id": uuid_task_id,
    "ec_remain_credits": int_credits_remain
}
Request we POST to your webhook endpoint; or you can polling the Common / GET Task
{
  "id": "uuid_task_id",
  "created_at": "2025-01-01T00:00:00.000Z",
  "status": "done",
  "error_message": null,
  "credit_cost": 1,
  "metadata": {
    "audio_url": "https://example.com/audio.mp3",
    "srt_url": "https://example.com/audio.srt",
    "json_url": "https://example.com/audio.json",
     // ...each task type has different metadata
  },
  "type": "dubbing"
}
Speech To Text
Transcribes a provided audio file and returns transcript as JSON and SRT.
Request

curl -X POST "https://api.ai33.pro/v1/task/speech-to-text" \
  -H "xi-api-key: $API_KEY" \
  -H "Content-Type: multipart/form-data" \
  -F file=@<file1> \
  -F receive_url="http://your-webhook-endpoint"
file: File mp3, aac, aiff, ogg, opus, wav, webm, flac, m4a (Max: 200MB)
receive_url: string We will send the POST request to your webhook endpoint with the transcript file when done. (optional)
Success Response Example
{
  "success": true,
  "task_id": uuid_task_id,
  "ec_remain_credits": int_credits_remain
}
Request we POST to your webhook endpoint; or you can polling the Common / GET Task
{
  "id": "uuid_task_id",
  "created_at": "2025-01-01T00:00:00.000Z",
  "status": "done",
  "error_message": null,
  "credit_cost": 1,
  "metadata": {
    "json_url": "https://example.com/transcript.json",
    "srt_url": "https://example.com/transcript.srt"
    // ...each task type has different metadata
  },
  "type": "speech_to_text"
}
List Models
Retrieve available voice synthesis models.

curl "https://api.ai33.pro/v1/models" \
  -H "Content-Type: application/json" \
  -H "xi-api-key: $API_KEY"
List Recommended Voices
Gets a list of all available voices for a user with search, filtering and pagination (as free user).

curl "https://api.ai33.pro/v2/voices" \
  -H "xi-api-key: $API_KEY"
Read Elevenlabs documentation for details
List Shared Voices
Retrieves a list of shared voices (as free user).

curl "https://api.ai33.pro/v1/shared-voices" \
  -H "xi-api-key: $API_KEY"