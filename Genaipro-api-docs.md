Authentication
API uses JWT token authentication

Base URL
All API requests should be made to:

https://genaipro.vn/api/v1
Step 1: Get your API Key
Use the API key management section above to get your JWT token.

Step 2: Include in Headers
Include the following headers in API requests:

Authorization: Bearer <your-jwt-token>
Content-Type: application/json
GET
/me
Get current user information including balance and credits

Response

{
  "id": "00000000-0000-0000-0000-000000000000",
  "username": "user",
  "balance": 1000,
  "credits": [
    {
      "amount": 1000,
      "expire_at": "2025-01-01T00:00:00+00:00"
    }
  ]
}
cURL Example

curl -X GET "https://genaipro.vn/api/v1/me" \
  -H "Authorization: Bearer {{token}}"
GET
/labs/voices
Get available ElevenLabs voices with filters

Query Parameters
page
optional
int
Page number (default: 0)
page_size
optional
int
Number of voices per page (default: 30)
search
optional
string
Search by voice name
sort
optional
enum
Sort by (trending, created_date, cloned_by_count, usage_character_count_1y)
language
optional
string
Filter by language
accent
optional
string
Filter by accent (american, british, australian, etc.)
use_cases
optional
array
Filter by use cases (can select multiple)
category
optional
string
Filter by category (premade, cloned, professional, etc.)
gender
optional
enum
Filter by gender (male, female, neutral)
age
optional
enum
Filter by age (young, middle_aged, old)
min_notice_period_days
optional
int
Minimum notice period in days
include_custom_rates
optional
boolean
Include custom rates (true/false, default: false)
include_live_moderated
optional
boolean
Include live moderated voices (true/false, default: true)
Response

{
  "voices": [
    {
      "voice_id": "uju3wxzG5OhpWcoi3SMy",
      "name": "Sarah",
      "category": "premade",
      "labels": {
        "accent": "american",
        "description": "soft",
        "age": "young",
        "gender": "female"
      }
    }
  ],
  "total": 50,
  "page": 1,
  "page_size": 30
}
cURL Example

curl -X GET "https://genaipro.vn/api/v1/labs/voices?page=0&page_size=30&search=sarah&sort=trending&language=en&gender=female" \
  -H "Authorization: Bearer {{token}}"
POST
/labs/task
Create a text-to-speech task

Request Body
input
required
string
Text to convert to speech
voice_id
required
string
Voice ID
model_id
required
enum
Available models: "eleven_multilingual_v2", "eleven_turbo_v2_5", "eleven_flash_v2_5", "eleven_v3"
style
optional
float
0.0 - 1.0, default 0.0
speed
optional
float
0.7 - 1.2, default 1.0
use_speaker_boost
optional
boolean
default false
similarity
optional
float
0.0 - 1.0, default 0.75
stability
optional
float
0.0 - 1.0, default 0.5
call_back_url
optional
string
Callback URL for completion
Request Body Example

{
  "input": "Hello world",
  "voice_id": "uju3wxzG5OhpWcoi3SMy",
  "model_id": "eleven_multilingual_v2",
  "style": 0.5,
  "speed": 1,
  "use_speaker_boost": true,
  "similarity": 0.75,
  "stability": 0.5,
  "call_back_url": "https://your-domain.com/callback"
}
Response

{
  "task_id": "task-uuid"
}
cURL Example

curl -X POST "https://genaipro.vn/api/v1/labs/task" \
  -H "Authorization: Bearer {{token}}" \
  -H "Content-Type: application/json" \
  -d '{
    "input": "Hello world",
    "voice_id": "uju3wxzG5OhpWcoi3SMy",
    "model_id": "eleven_multilingual_v2",
    "style": 0.5,
    "speed": 1.0,
    "use_speaker_boost": true,
    "similarity": 0.75,
    "stability": 0.5,
    "call_back_url": "https://your-domain.com/webhook"
  }'
GET
/labs/task/:task_id
Get task details by task_id

URL Parameters
task_id
required
string
Task ID to get information
Response

{
  "id": "00000000-0000-0000-0000-000000000000",
  "input": "Hello world",
  "voice_id": "uju3wxzG5OhpWcoi3SMy",
  "model_id": "eleven_multilingual_v2",
  "style": 0.5,
  "speed": 1,
  "use_speaker_boost": true,
  "similarity": 0.75,
  "stability": 0.5,
  "created_at": "0000-00-00T00:00:00+00:00",
  "status": "completed",
  "result": "https://files.genaipro.vn/00000000-0000-0000-0000-000000000000.mp3",
  "subtitle": "https://files.genaipro.vn/00000000-0000-0000-0000-000000000000.srt"
}
cURL Example

curl -X GET "https://genaipro.vn/api/v1/labs/task/task-uuid" \
  -H "Authorization: Bearer {{token}}"
GET
/labs/task
Get user's task history

Query Parameters
page
optional
int
Page number, default is 1
limit
optional
int
Number of tasks per page, default is 20
Response

{
  "tasks": [
    {
      "id": "00000000-0000-0000-0000-000000000000",
      "input": "Hello world",
      "voice_id": "uju3wxzG5OhpWcoi3SMy",
      "model_id": "eleven_multilingual_v2",
      "style": 0.5,
      "speed": 1,
      "use_speaker_boost": true,
      "similarity": 0.75,
      "stability": 0.5,
      "created_at": "0000-00-00T00:00:00+00:00",
      "status": "completed",
      "result": "https://files.genaipro.vn/00000000-0000-0000-0000-000000000000.mp3",
      "subtitle": "https://files.genaipro.vn/00000000-0000-0000-0000-000000000000.srt"
    }
  ],
  "total": 1,
  "page": "1",
  "limit": "20"
}
cURL Example

curl -X GET "https://genaipro.vn/api/v1/labs/task?page=1&limit=10" \
  -H "Authorization: Bearer {{token}}"
DELETE
/labs/task/:task_id
Delete task by task_id

URL Parameters
task_id
required
string
Task ID to delete
Response

HTTP 200 OK
cURL Example

curl -X DELETE "https://genaipro.vn/api/v1/labs/task/task-uuid" \
  -H "Authorization: Bearer {{token}}"
POST
/labs/task/subtitle/:task_id
Export subtitle for a task

URL Parameters
task_id
required
string
Task ID to export subtitle
Response

HTTP 200 OK
cURL Example

curl -X POST "https://genaipro.vn/api/v1/labs/task/subtitle/abc123def456" \
  -H "Authorization: Bearer {{token}}" \
  -H "Content-Type: application/json" \
  -d '{
    "max_characters_per_line": 40,
    "max_lines_per_cue": 2,
    "max_seconds_per_cue": 5
  }'
CALLBACK
Webhook Callback
When task completes, system will POST to your callback URL

Payload

{
  "error": "",
  "id": "00000000-0000-0000-0000-000000000000",
  "input": "Hello world",
  "result": "https://files.genaipro.vn/00000000-0000-0000-0000-000000000000.mp3",
  "subtitle": "https://files.genaipro.vn/00000000-0000-0000-0000-000000000000.srt"
}
GET
/max/voices
Get list of Max voices with filters by language, gender and age

Query Parameters
page
optional
int
Page number (default: 1)
page_size
optional
int
Number of voices per page (default: 10, max: 100)
language
optional
string
Filter by language: Vietnamese, English, Arabic, Cantonese, Chinese (Mandarin), Dutch, French, German, Indonesian, Italian, Japanese, Korean, Portuguese, Russian, Spanish, Turkish, Ukrainian, Thai, Polish, Romanian, Greek, Czech, Finnish, Hindi, Bulgarian, Danish, Hebrew, Malayan, Persian, Slovak, Swedish, Croatian, Filipino, Hungarian, Norwegian, Slovenian, Catalan, Nynorsk, Tamil, Afrikaans
gender
optional
enum
Male or Female
age
optional
enum
Youth, Young Adult, Adult, Middle Aged, Senior
Response

{
  "voice_list": [
    {
      "voice_id": "226893671006272",
      "parent_voice_id": "0",
      "voice_name": "Trustworthy Man",
      "tag_list": [
        "English",
        "Male",
        "Adult",
        "Audiobook",
        "EN-US (General)"
      ],
      "file_id": "",
      "cover_url": "https://filecdn.max.chat/public/db3905ad-df3d-4fd2-98ea-02e453372e25.png",
      "create_time": 1736946762644,
      "update_time": 1754552253051,
      "collected": false,
      "voice_status": 2,
      "sample_audio": "https://cdn.hailuoai.video/moss/prod/2025-08-06-17/moss-audio/user_audio/1754474323028588219-298686485184619.mp3",
      "uniq_id": "English_Trustworth_Man",
      "group_id": "0",
      "description": "A trustworthy and resonant adult male voice with a general American accent, conveying sincerity and reliability.",
      "generate_channel": 3
    }
  ],
  "total": 466,
  "has_more": true
}
cURL Example

curl -X GET "https://genaipro.vn/api/v1/max/voices?page=1&page_size=10&language=Vietnamese&gender=Female" \
  -H "Authorization: Bearer {{token}}"
POST
/max/tasks
Create text-to-speech task using Max

Request Body
text
required
string
Text to convert to speech
title
optional
string
Task title (optional)
voice_id
required
string
Max voice ID
model_id
optional
enum
Max model (speech-2.5-hd-preview (default), speech-2.5-turbo-preview, speech-02-hd, speech-02-turbo, speech-01-hd, speech-01-turbo, speech-2.6-hd, speech-2.6-turbo)
speed
optional
float
Reading speed (0.5 - 2.0, default: 1.0)
pitch
optional
int
Voice pitch (-12 to 12, default: 0)
volume
optional
float
Volume (0-10, default: 1)
language
optional
enum
Language (Auto (default), Vietnamese, English, Arabic, Cantonese, Chinese (Mandarin), Dutch, French, German, Indonesian, Italian, Japanese, Korean, Portuguese, Russian, Spanish, Turkish, Ukrainian, Thai, Polish, Romanian, Greek, Czech, Finnish, Hindi, Bulgarian, Danish, Hebrew, Malayan, Persian, Slovak, Swedish, Croatian, Filipino, Hungarian, Norwegian, Slovenian, Catalan, Nynorsk, Tamil, Afrikaans)
is_clone
optional
boolean
Whether to use voice clone (default: false)
call_back_url
optional
string
Callback URL for completion
Request Body Example

{
  "text": "Hello world",
  "title": "Hello world",
  "voice_id": "voice-id-from-voices-endpoint",
  "model_id": "speech-2.5-hd-preview",
  "language": "Vietnamese",
  "speed": 1,
  "pitch": 0,
  "volume": 1,
  "is_clone": false,
  "call_back_url": "https://callback.example.com"
}
Response

{
  "id": "task-uuid",
  "created_at": "2024-01-01T00:00:00Z",
  "updated_at": "2024-01-01T00:00:00Z",
  "title": "Hello world",
  "content": "Hello world",
  "user_id": "user-id",
  "status": "processing",
  "result": null,
  "voice_id": "voice-id-123",
  "model_id": "speech-2.5-hd-preview",
  "error": null,
  "speed": 1,
  "pitch": 0,
  "volume": 1,
  "language": "Vietnamese",
  "is_clone": false,
  "process_percentage": 0
}
cURL Example

curl -X POST "https://genaipro.vn/api/v1/max/tasks" \
  -H "Authorization: Bearer {{token}}" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Hello world",
    "title": "Hello world",
    "voice_id": "voice-id-from-voices-list",
    "model_id": "speech-2.5-hd-preview",
    "language": "Vietnamese",
    "speed": 1.0,
    "pitch": 0,
    "volume": 1.0,
    "is_clone": false,
    "call_back_url": "https://callback.example.com"
  }'
GET
/max/tasks/:task_id
Get detailed information of task by ID

URL Parameters
task_id
required
string
Task ID to get details
Response

{
  "id": "task-uuid",
  "created_at": "2024-01-01T00:00:00Z",
  "updated_at": "2024-01-01T00:05:00Z",
  "title": "Task mẫu",
  "content": "Hello world",
  "user_id": "user-id",
  "status": "completed",
  "result": "https://files.genaipro.vn/max/file.mp3",
  "voice_id": "voice-id-123",
  "model_id": "speech-2.5-hd-preview",
  "error": null,
  "speed": 1,
  "pitch": 0,
  "volume": 1,
  "language": "Vietnamese",
  "is_clone": false,
  "process_percentage": 100
}
cURL Example

curl -X GET "https://genaipro.vn/api/v1/max/tasks/task-uuid" \
  -H "Authorization: Bearer {{token}}"
GET
/max/tasks
Get list of created tasks with pagination

Query Parameters
page
optional
int
Page number (default: 1)
page_size
optional
int
Number of tasks per page (default: 10)
Response

{
  "tasks": [
    {
      "id": "task-uuid",
      "created_at": "2024-01-01T00:00:00Z",
      "updated_at": "2024-01-01T00:05:00Z",
      "title": "Hello world",
      "content": "Hello world",
      "user_id": "user-id",
      "status": "completed",
      "result": "https://files.genaipro.vn/max/file.mp3",
      "voice_id": "voice-id-123",
      "model_id": "speech-2.5-hd-preview",
      "error": null,
      "speed": 1,
      "pitch": 0,
      "volume": 1,
      "language": "Vietnamese",
      "is_clone": false,
      "process_percentage": 100
    }
  ],
  "total": 25,
  "page": 1,
  "page_size": 10
}
cURL Example

curl -X GET "https://genaipro.vn/api/v1/max/tasks?page=1&page_size=10" \
  -H "Authorization: Bearer {{token}}"
DELETE
/max/tasks/:task_id
Delete task by ID

URL Parameters
task_id
required
string
Task ID to delete
cURL Example

curl -X DELETE "https://genaipro.vn/api/v1/max/tasks/task-uuid" \
  -H "Authorization: Bearer {{token}}"
GET
/max/voice-clones
Get list of created voice clones

Response

{
  "voice_clones": [
    {
      "id": "e3f4633a-2cf6-41d8-b308-ee73eb61f636",
      "voice_id": "",
      "parent_voice_id": "",
      "voice_name": "Hello world",
      "tag_list": [
        "Vietnamese"
      ],
      "file_id": "310156611940593",
      "cover_url": "",
      "create_time": 0,
      "update_time": 0,
      "collected": false,
      "voice_status": 2,
      "sample_audio": "",
      "uniq_id": "moss_audio_17450988-8c24-11f0-a7a0-b6b1e831bdf2",
      "group_id": "1962874919310070296",
      "description": "",
      "generate_channel": 1,
      "need_noise_reduction": true,
      "preview_text": "Hello world"
    }
  ],
  "total": 5,
  "limit": 30
}
cURL Example

curl -X GET "https://genaipro.vn/api/v1/max/voice-clones" \
  -H "Authorization: Bearer {{token}}"
POST
/max/voice-clones
Create voice clone from audio file

Response

{
  "id": "e3f4633a-2cf6-41d8-b308-ee73eb61f636",
  "voice_id": "",
  "parent_voice_id": "",
  "voice_name": "Hello world",
  "tag_list": [
    "Vietnamese"
  ],
  "file_id": "310156611940593",
  "cover_url": "",
  "create_time": 0,
  "update_time": 0,
  "collected": false,
  "voice_status": 2,
  "sample_audio": "",
  "uniq_id": "moss_audio_17450988-8c24-11f0-a7a0-b6b1e831bdf2",
  "group_id": "1962874919310070296",
  "description": "",
  "generate_channel": 1,
  "need_noise_reduction": true,
  "preview_text": "Hello world"
}
cURL Example

curl -X POST "https://genaipro.vn/api/v1/max/voice-clones" \
  -H "Authorization: Bearer {{token}}" \
  -F "voice_name=My Custom Voice" \
  -F "audio_file=@/path/to/audio.mp3" \
  -F "language_tag=Vietnamese" \
  -F "preview_text=Đây là văn bản preview" \
  -F "need_noise_reduction=true"
DELETE
/max/voice-clones/:id
Delete voice clone by ID

URL Parameters
id
required
string
Voice clone ID to delete
cURL Example

curl -X DELETE "https://genaipro.vn/api/v1/max/voice-clones/clone-uuid" \
  -H "Authorization: Bearer {{token}}"
CALLBACK
Webhook Callback
When Max task completes, system will POST to your callback URL

Payload

{
  "error": "",
  "id": "00000000-0000-0000-0000-000000000000",
  "input": "Hello world",
  "result": "https://files.genaipro.vn/00000000-0000-0000-0000-000000000000.mp3"
}