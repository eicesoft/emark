package main

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	goruntime "runtime"

	"github.com/wailsapp/wails/v2/pkg/menu"
	"github.com/wailsapp/wails/v2/pkg/menu/keys"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// App struct
type App struct {
	ctx         context.Context
	currentFile string
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{}
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
}

// Greet returns a greeting for the given name
func (a *App) Greet(name string) string {
	return fmt.Sprintf("Hello %s, It's show time!", name)
}

var mdFilters = []runtime.FileFilter{
	{DisplayName: "Markdown 文件 (*.md;*.markdown;*.txt)", Pattern: "*.md;*.markdown;*.txt"},
	{DisplayName: "所有文件 (*.*)", Pattern: "*.*"},
}

func (a *App) showError(title, message string) {
	_, _ = runtime.MessageDialog(a.ctx, runtime.MessageDialogOptions{
		Type:    runtime.ErrorDialog,
		Title:   title,
		Message: message,
	})
}

// ExportMarkdown opens a save dialog and writes content to the chosen file.
// Returns the saved path, or "" when the user cancels.
func (a *App) ExportMarkdown(content string) string {
	path, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
		DefaultFilename: "document.md",
		Filters:         mdFilters,
	})
	if err != nil {
		a.showError("导出失败", err.Error())
		return ""
	}
	if path == "" {
		return ""
	}
	if filepath.Ext(path) == "" {
		path += ".md"
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		a.showError("导出失败", err.Error())
		return ""
	}
	return path
}

// SaveMarkdown writes content to the file last opened by the Open command,
// or prompts with a save dialog when the document has no file yet.
// Returns the saved path, or "" when cancelled or failed.
func (a *App) SaveMarkdown(content string) string {
	if a.currentFile != "" {
		if err := os.WriteFile(a.currentFile, []byte(content), 0o644); err != nil {
			a.showError("保存失败", err.Error())
			return ""
		}
		return a.currentFile
	}
	path, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
		DefaultFilename: "document.md",
		Filters:         mdFilters,
	})
	if err != nil {
		a.showError("保存失败", err.Error())
		return ""
	}
	if path == "" {
		return ""
	}
	if filepath.Ext(path) == "" {
		path += ".md"
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		a.showError("保存失败", err.Error())
		return ""
	}
	a.currentFile = path
	return path
}

// pickAndRead opens a file dialog and reads the chosen file as UTF-8 text.
// Returns content, absolute path and ok flag.
func (a *App) pickAndRead() (string, string, bool) {
	path, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Filters: mdFilters,
	})
	if err != nil {
		a.showError("打开失败", err.Error())
		return "", "", false
	}
	if path == "" {
		return "", "", false
	}
	data, err := os.ReadFile(path)
	if err != nil {
		a.showError("读取失败", err.Error())
		return "", "", false
	}
	return strings.TrimPrefix(string(data), "\xef\xbb\xbf"), path, true
}

// buildMenu creates the application menu bar.
func (a *App) buildMenu() *menu.Menu {
	root := menu.NewMenu()
	if goruntime.GOOS == "darwin" {
		root.Append(menu.AppMenu())
	}

	fileMenu := root.AddSubmenu("文件")
	fileMenu.AddText("新建", keys.CmdOrCtrl("n"), func(*menu.CallbackData) {
		a.currentFile = ""
		runtime.EventsEmit(a.ctx, "menu:new")
	})
	fileMenu.AddText("打开…", keys.CmdOrCtrl("o"), func(*menu.CallbackData) {
		if data, path, ok := a.pickAndRead(); ok {
			a.currentFile = path
			runtime.EventsEmit(a.ctx, "menu:open", data)
		}
	})
	fileMenu.AddText("保存", keys.CmdOrCtrl("s"), func(*menu.CallbackData) {
		runtime.EventsEmit(a.ctx, "menu:save")
	})
	fileMenu.AddText("导入…", keys.CmdOrCtrl("i"), func(*menu.CallbackData) {
		if data, _, ok := a.pickAndRead(); ok {
			runtime.EventsEmit(a.ctx, "menu:import", data)
		}
	})
	fileMenu.AddText("导出…", keys.CmdOrCtrl("e"), func(*menu.CallbackData) {
		runtime.EventsEmit(a.ctx, "menu:export")
	})
	fileMenu.AddSeparator()
	fileMenu.AddText("退出", keys.CmdOrCtrl("q"), func(*menu.CallbackData) {
		runtime.Quit(a.ctx)
	})

	editMenu := root.AddSubmenu("编辑")
	emitEdit := func(action string) menu.Callback {
		return func(*menu.CallbackData) {
			runtime.EventsEmit(a.ctx, "menu:edit", action)
		}
	}
	editMenu.AddText("撤销", keys.CmdOrCtrl("z"), emitEdit("undo"))
	editMenu.AddText("重做", keys.CmdOrCtrl("y"), emitEdit("redo"))
	editMenu.AddSeparator()
	editMenu.AddText("剪切", keys.CmdOrCtrl("x"), emitEdit("cut"))
	editMenu.AddText("复制", keys.CmdOrCtrl("c"), emitEdit("copy"))
	editMenu.AddText("粘贴", keys.CmdOrCtrl("v"), emitEdit("paste"))
	editMenu.AddSeparator()
	editMenu.AddText("全选", keys.CmdOrCtrl("a"), emitEdit("selectall"))

	viewMenu := root.AddSubmenu("查看")
	viewMenu.AddText("切换预览", keys.CmdOrCtrl("p"), func(*menu.CallbackData) {
		runtime.EventsEmit(a.ctx, "menu:preview")
	})

	return root
}
