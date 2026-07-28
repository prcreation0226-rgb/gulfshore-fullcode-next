import { useChat } from "@ai-sdk/react"; import { DefaultChatTransport } from "ai"; const { messages } = useChat({ transport: new DefaultChatTransport({ api: "/api/v2/ai/chat" }) });
