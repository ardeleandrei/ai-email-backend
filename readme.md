# AI Email Backend

This backend provides a server that streams email content over **Server-Sent Events (SSE)**.  
It is designed to be used with the React `ComposeModal` frontend.

## Features

- **`GET /ai/stream`** – streams email text from the AI response as SSE events
- **`POST /emails`** – saves an email payload in memory