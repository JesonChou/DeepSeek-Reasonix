package plugin

import (
	"context"
	"os"
	"path/filepath"
	"testing"
)

// TestNewStdioTransportDirExplicit verifies that explicit Spec.Dir takes
// precedence over WorkspaceRoot for cmd.Dir.
func TestNewStdioTransportDirExplicit(t *testing.T) {
	exe, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	explicitDir := filepath.Join(t.TempDir(), "explicit")
	if err := os.MkdirAll(explicitDir, 0o755); err != nil {
		t.Fatal(err)
	}
	workspaceRoot := filepath.Join(t.TempDir(), "workspace")
	if err := os.MkdirAll(workspaceRoot, 0o755); err != nil {
		t.Fatal(err)
	}
	spec := Spec{
		Name:          "test-dir",
		Command:       exe,
		Args:          []string{"-test.run=TestHelperProcess", "--"},
		Dir:           explicitDir,
		WorkspaceRoot: workspaceRoot,
		Env:           map[string]string{"GO_WANT_HELPER_PROCESS": "1"},
	}
	tr, err := newStdioTransport(context.Background(), spec)
	if err != nil {
		t.Fatalf("newStdioTransport: %v", err)
	}
	defer tr.close()
	if tr.cmd.Dir != explicitDir {
		t.Fatalf("cmd.Dir = %q, want %q (explicit Dir should take precedence)", tr.cmd.Dir, explicitDir)
	}
}

// TestNewStdioTransportDirFallbackWorkspaceRoot verifies that when Spec.Dir
// is empty, the subprocess working directory falls back to Spec.WorkspaceRoot.
// This prevents relative config file paths (e.g. --config-file ssh-config.json
// in .mcp.json) from resolving against the desktop process CWD instead of the
// project root where the config file lives (#6778).
func TestNewStdioTransportDirFallbackWorkspaceRoot(t *testing.T) {
	exe, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	workspaceRoot := filepath.Join(t.TempDir(), "workspace")
	if err := os.MkdirAll(workspaceRoot, 0o755); err != nil {
		t.Fatal(err)
	}
	spec := Spec{
		Name:          "test-fallback",
		Command:       exe,
		Args:          []string{"-test.run=TestHelperProcess", "--"},
		WorkspaceRoot: workspaceRoot,
		Env:           map[string]string{"GO_WANT_HELPER_PROCESS": "1"},
	}
	tr, err := newStdioTransport(context.Background(), spec)
	if err != nil {
		t.Fatalf("newStdioTransport: %v", err)
	}
	defer tr.close()
	if tr.cmd.Dir != workspaceRoot {
		t.Fatalf("cmd.Dir = %q, want %q (should fall back to WorkspaceRoot when Dir is empty)", tr.cmd.Dir, workspaceRoot)
	}
}

// TestNewStdioTransportDirEmptyWhenBothEmpty verifies that cmd.Dir remains
// empty (inherits parent CWD) when both Dir and WorkspaceRoot are empty.
func TestNewStdioTransportDirEmptyWhenBothEmpty(t *testing.T) {
	exe, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	spec := Spec{
		Name:    "test-empty",
		Command: exe,
		Args:    []string{"-test.run=TestHelperProcess", "--"},
		Env:     map[string]string{"GO_WANT_HELPER_PROCESS": "1"},
	}
	tr, err := newStdioTransport(context.Background(), spec)
	if err != nil {
		t.Fatalf("newStdioTransport: %v", err)
	}
	defer tr.close()
	if tr.cmd.Dir != "" {
		t.Fatalf("cmd.Dir = %q, want empty (should inherit parent CWD when both Dir and WorkspaceRoot are empty)", tr.cmd.Dir)
	}
}

// TestNewStdioTransportDirDoesNotOverwriteForCodeGraph confirms the fix does
// not regress CodeGraph / codebase-memory-mcp which set Dir via
// ApplyKnownOverrides.
func TestNewStdioTransportDirDoesNotOverwriteForCodeGraph(t *testing.T) {
	exe, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	projectRoot := filepath.Join(t.TempDir(), "project")
	if err := os.MkdirAll(projectRoot, 0o755); err != nil {
		t.Fatal(err)
	}
	// Simulate what ApplyKnownOverrides does: set Dir = workspaceRoot for CodeGraph.
	spec := Spec{
		Name:          "codegraph",
		Command:       exe,
		Args:          []string{"-test.run=TestHelperProcess", "--"},
		Dir:           projectRoot, // set by ApplyKnownOverrides
		WorkspaceRoot: projectRoot,
		Env:           map[string]string{"GO_WANT_HELPER_PROCESS": "1"},
		LowPriority:   true,
	}
	tr, err := newStdioTransport(context.Background(), spec)
	if err != nil {
		t.Fatalf("newStdioTransport: %v", err)
	}
	defer tr.close()
	if tr.cmd.Dir != projectRoot {
		t.Fatalf("cmd.Dir = %q, want %q (CodeGraph Dir should be preserved)", tr.cmd.Dir, projectRoot)
	}
}
