import { cn } from "@/lib/utils";

type Message = { id: string; role: string; content: string; createdAt: Date };

export function ChatThread({ messages }: { messages: Message[] }) {
  if (messages.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 py-16 text-center text-muted">
        <span className="text-3xl">✨</span>
        <p className="text-sm">
          Ask me anything — e.g. &quot;I have an exam tomorrow and football training today, what should I do?&quot;
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-3 overflow-y-auto py-2">
      {messages.map((m) => (
        <div key={m.id} className={cn("flex", m.role === "USER" ? "justify-end" : "justify-start")}>
          <div
            className={cn(
              "max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm",
              m.role === "USER" ? "bg-accent text-accent-foreground" : "bg-surface-muted text-foreground"
            )}
          >
            {m.content}
          </div>
        </div>
      ))}
    </div>
  );
}
