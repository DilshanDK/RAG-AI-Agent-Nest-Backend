# 🛠️ RAG AI Agent - NestJS Backend API

Autonomous Retrieval-Augmented Generation (RAG) backend built with **NestJS**, **LangChain**, and **PostgreSQL (`pgvector`)**.

---

## 🚀 Features

- **🧠 LangChain ReAct Reasoning Loop**: Multi-step agentic problem solving using dynamic tools (`search_documents`, `summarize_document`, `list_all_documents`).
- **📐 PostgreSQL Vector Store**: Native `pgvector` vector similarity search with cosine distance queries (`<=>`) on 768-dimensional embeddings.
- **⚡ Dynamic Multi-Model Selector**: Dynamically routes queries to **Groq** (`llama-3.1-8b-instant`), **Google Gemini** (`gemini-1.5-flash`), or **OpenRouter** (`llama-3.3-70b-instruct:free`).
- **💬 Multi-Session Chat & State Persistence**: Create, switch, and persist separate chat threads with title auto-naming and conversation history.
- **🎯 Document Focus Mode ("Study This File")**: Filter vector similarity searches and agent tools to an individual uploaded document or search across all files.
- **🛡️ Serverless Connection Resilience**: Built-in 30s connection timeout and automatic retry loops to handle cloud database cold starts (Neon PostgreSQL).

---

## 📦 Project Setup

### 1. Prerequisites
- **Node.js**: v18+ or v20+
- **PostgreSQL**: PostgreSQL 16+ with `pgvector` extension OR a free cloud instance on [Neon](https://neon.tech)

### 2. Installation
```bash
# Install dependencies (use --legacy-peer-deps for LangChain peer dependencies)
npm install --legacy-peer-deps
```

### 3. Environment Configuration
Create a `.env` file from the provided template:
```bash
cp .env.example .env
```

Configure your `.env`:
```env
PORT=3000
DATABASE_URL="postgresql://user:password@ep-something.region.neon.tech/neondb?sslmode=require&connect_timeout=30"

# AI Provider API Keys
GEMINI_API_KEY="your_gemini_api_key"
GROQ_API_KEY="your_groq_api_key"
OPENROUTER_API_KEY="your_openrouter_api_key"

# Active Default Provider: groq | gemini | openrouter
AI_PROVIDER="groq"
```

### 4. Database Push & Prisma Generation
```bash
npx prisma db push
```

### 5. Start the Server
```bash
# Development watch mode
npm run start:dev

# Production mode
npm run build
npm run start:prod
```

The API will be available at `http://localhost:3000`.

---

## 📚 API Endpoints Overview

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/agent/chat` | Send a prompt to the autonomous LangChain agent (supports `sessionId`, `documentId`, `provider`) |
| `POST` | `/documents/upload` | Upload and auto-chunk/embed a file (`.pdf`, `.txt`, `.md`) |
| `GET` | `/documents` | List all uploaded documents with metadata and chunk counts |
| `DELETE` | `/documents/:id` | Delete a document and all associated vector embeddings |
| `POST` | `/chat/sessions` | Create a new chat session thread |
| `GET` | `/chat/sessions/:userId` | Get all chat sessions for a user |
| `PATCH` | `/chat/sessions/:sessionId` | Update session title, focus document, or provider |
| `DELETE` | `/chat/sessions/:sessionId` | Delete a session and its message history |
| `GET` | `/chat/history/:userId` | Get message history (optionally filtered by `?sessionId=...`) |
| `DELETE` | `/chat/history/:userId` | Clear conversation history |

Detailed request & response schemas can be found in [mdfiles/api_documentation.md](../mdfiles/api_documentation.md).

---

## 🔒 Security
- **Zero hardcoded secrets**: All credentials are strictly read via `ConfigService` from environment variables.
- User-uploaded documents and `.env` files are ignored by git via `.gitignore`.

---

## 📜 License
MIT
