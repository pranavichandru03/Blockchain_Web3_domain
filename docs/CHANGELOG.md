
---

#### **`ARCHITECTURE.md` (System Design)**
```markdown
# Architecture

## Flow Diagram
![Flow Diagram](assets/flow-diagram.png)

## Components
1. **Backend**:
   - Node.js/Express server
   - OpenAI integration
   - Ethereum provider (Infura/Alchemy)

2. **Frontend**:
   - Vanilla HTML/JS
   - Communicates via REST API

## Data Flow
User → Frontend → Backend → OpenAI/Ethereum → Response