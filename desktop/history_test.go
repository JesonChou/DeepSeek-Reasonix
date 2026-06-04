package main

import (
	"path/filepath"
	"testing"

	"reasonix/internal/agent"
	"reasonix/internal/provider"
)

func TestHistoryMessagesIncludeAssistantReasoning(t *testing.T) {
	msgs := []provider.Message{
		{Role: provider.RoleUser, Content: "expanded prompt"},
		{Role: provider.RoleAssistant, Content: "answer", ReasoningContent: "thinking trace"},
		{Role: provider.RoleTool, Content: "tool output", ReasoningContent: "ignored by frontend filter"},
		{Role: provider.RoleAssistant, ReasoningContent: "tool-call-only thinking"},
	}

	got := historyMessages(msgs, func(content string) string {
		if content != "expanded prompt" {
			t.Fatalf("unexpected user content passed to resolver: %q", content)
		}
		return "display prompt"
	})

	if len(got) != len(msgs) {
		t.Fatalf("history length = %d, want %d", len(got), len(msgs))
	}
	if got[0].Content != "display prompt" {
		t.Fatalf("user display content = %q, want display prompt", got[0].Content)
	}
	if got[1].Reasoning != "thinking trace" {
		t.Fatalf("assistant reasoning = %q, want thinking trace", got[1].Reasoning)
	}
	if got[2].Reasoning != "" {
		t.Fatalf("non-assistant reasoning should stay hidden, got %q", got[2].Reasoning)
	}
	// Tool message: Content moves to ToolOutput, Content is cleared.
	if got[2].ToolOutput != "tool output" {
		t.Fatalf("tool output = %q, want tool output", got[2].ToolOutput)
	}
	if got[2].Content != "" {
		t.Fatalf("tool message Content should be cleared, got %q", got[2].Content)
	}
	if got[3].Reasoning != "tool-call-only thinking" {
		t.Fatalf("empty-content assistant reasoning = %q, want tool-call-only thinking", got[3].Reasoning)
	}
}

func TestPreviewSessionMessagesLoadsWithoutResuming(t *testing.T) {
	dir := t.TempDir()
	session := agent.NewSession("")
	session.Add(provider.Message{Role: provider.RoleUser, Content: "show history"})
	session.Add(provider.Message{Role: provider.RoleAssistant, Content: "answer", ReasoningContent: "saved reasoning"})
	path := filepath.Join(dir, "session.jsonl")
	if err := session.Save(path); err != nil {
		t.Fatalf("Save: %v", err)
	}

	got, err := previewSessionMessages(dir, path)
	if err != nil {
		t.Fatalf("previewSessionMessages: %v", err)
	}
	if len(got) != 2 {
		t.Fatalf("preview history length = %d, want 2", len(got))
	}
	if got[1].Reasoning != "saved reasoning" {
		t.Fatalf("preview reasoning = %q, want saved reasoning", got[1].Reasoning)
	}
}

func TestHistoryMessagesToolCallsFromHistory(t *testing.T) {
	msgs := []provider.Message{
		{Role: provider.RoleUser, Content: "edit app.go"},
		{
			Role:    provider.RoleAssistant,
			Content: "",
			ToolCalls: []provider.ToolCall{
				{ID: "call_1", Name: "read_file", Arguments: `{"path":"app.go"}`},
			},
		},
		{Role: provider.RoleTool, ToolCallID: "call_1", Name: "read_file", Content: "package main\n..."},
		{
			Role:    provider.RoleAssistant,
			Content: "here is the file",
			ToolCalls: []provider.ToolCall{
				{ID: "call_2", Name: "edit_file", Arguments: `{"path":"app.go","old":"x","new":"y"}`},
			},
		},
		{Role: provider.RoleTool, ToolCallID: "call_2", Name: "edit_file", Content: "ok"},
		{Role: provider.RoleAssistant, Content: "done"},
	}

	got := historyMessages(msgs, func(s string) string { return s })

	// The tool messages (indices 2 and 4) should carry tool fields and empty Content.
	if got[2].Role != "tool" {
		t.Fatalf("msg[2] role = %q, want tool", got[2].Role)
	}
	if got[2].ToolName != "read_file" {
		t.Fatalf("msg[2] toolName = %q, want read_file", got[2].ToolName)
	}
	if got[2].ToolOutput != "package main\n..." {
		t.Fatalf("msg[2] toolOutput = %q", got[2].ToolOutput)
	}
	if got[2].ToolID != "call_1" {
		t.Fatalf("msg[2] toolId = %q, want call_1", got[2].ToolID)
	}
	if got[2].ToolArgs != `{"path":"app.go"}` {
		t.Fatalf("msg[2] toolArgs = %q, want args from paired assistant", got[2].ToolArgs)
	}
	if got[2].Content != "" {
		t.Fatalf("msg[2] Content = %q, want empty (tool output moved to ToolOutput)", got[2].Content)
	}

	// Second tool message: edit_file with args from assistant
	if got[4].ToolName != "edit_file" {
		t.Fatalf("msg[4] toolName = %q, want edit_file", got[4].ToolName)
	}
	if got[4].ToolArgs != `{"path":"app.go","old":"x","new":"y"}` {
		t.Fatalf("msg[4] toolArgs = %q", got[4].ToolArgs)
	}
	if got[4].ToolOutput != "ok" {
		t.Fatalf("msg[4] toolOutput = %q, want ok", got[4].ToolOutput)
	}

	// Assistant messages (indices 1, 3, 5) should NOT have tool fields.
	if got[1].ToolName != "" || got[1].ToolArgs != "" || got[1].ToolOutput != "" {
		t.Fatalf("assistant msg[1] should not carry tool fields")
	}
	// The assistant-with-tool-calls-and-content at index 3 should still have its text.
	if got[3].Content != "here is the file" {
		t.Fatalf("msg[3] Content = %q, want \"here is the file\"", got[3].Content)
	}
	if got[5].Content != "done" {
		t.Fatalf("msg[5] Content = %q, want done", got[5].Content)
	}
}
