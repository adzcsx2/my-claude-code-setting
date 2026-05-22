#!/usr/bin/env python3
"""
Android 远程签名配置工具 - Windows GUI 版本
"""

import os
import sys
import shutil
import tkinter as tk
from tkinter import ttk, filedialog, messagebox, scrolledtext
from pathlib import Path
import threading
import queue
import argparse


def get_script_dir() -> Path:
    """获取脚本所在目录"""
    return Path(__file__).parent


def get_project_root(args_path: str = None) -> Path:
    """获取项目根目录"""
    if args_path:
        return Path(args_path).resolve()
    return Path(__file__).parent.parent.resolve()


class ConfigToolGUI:
    def __init__(self, root):
        self.root = root
        self.root.title("Android 远程签名配置工具")
        self.root.geometry("700x600")
        self.root.resizable(True, True)

        # 设置图标（如果有的话）
        try:
            self.root.iconbitmap('icon.ico')
        except:
            pass

        # 日志队列
        self.log_queue = queue.Queue()

        # 导入配置函数（延迟导入以避免问题）
        self.config_funcs = None
        self.import_config_functions()

        self.setup_ui()

    def import_config_functions(self):
        """导入配置函数"""
        # 添加 remote_sign 目录到 Python 路径
        script_dir = get_script_dir()
        if str(script_dir) not in sys.path:
            sys.path.insert(0, str(script_dir))

        try:
            from apply_remote_sign import (
                create_env_example,
                update_gitignore,
                update_gradle_properties,
                update_app_build_gradle,
            )
            self.config_funcs = {
                'create_env_example': create_env_example,
                'update_gitignore': update_gitignore,
                'update_gradle_properties': update_gradle_properties,
                'update_app_build_gradle': update_app_build_gradle,
            }
        except ImportError as e:
            self.log("ERROR", f"导入配置模块失败: {e}")
            self.config_funcs = None

    def setup_ui(self):
        # 主框架
        main_frame = ttk.Frame(self.root, padding="10")
        main_frame.grid(row=0, column=0, sticky=(tk.W, tk.E, tk.N, tk.S))

        # 配置行列权重
        self.root.columnconfigure(0, weight=1)
        self.root.rowconfigure(0, weight=1)
        main_frame.columnconfigure(0, weight=1)
        main_frame.rowconfigure(3, weight=1)

        # 标题
        title_label = ttk.Label(
            main_frame,
            text="Android 远程签名配置工具",
            font=("Microsoft YaHei UI", 16, "bold")
        )
        title_label.grid(row=0, column=0, pady=(0, 20))

        # 项目选择框架
        path_frame = ttk.LabelFrame(main_frame, text="选择 Android 项目目录", padding="10")
        path_frame.grid(row=1, column=0, sticky=(tk.W, tk.E), pady=(0, 10))
        path_frame.columnconfigure(0, weight=1)

        self.project_path_var = tk.StringVar()
        path_entry = ttk.Entry(path_frame, textvariable=self.project_path_var, font=("Microsoft YaHei UI", 10))
        path_entry.grid(row=0, column=0, sticky=(tk.W, tk.E), padx=(0, 10))

        browse_btn = ttk.Button(path_frame, text="浏览...", command=self.browse_directory, width=10)
        browse_btn.grid(row=0, column=1)

        # 额外模块配置
        modules_label = ttk.Label(path_frame, text="额外模块（可选，逗号分隔，如 app_d,app_link）:", font=("Microsoft YaHei UI", 9))
        modules_label.grid(row=1, column=0, sticky=tk.W, pady=(8, 2))

        self.extra_modules_var = tk.StringVar()
        modules_entry = ttk.Entry(path_frame, textvariable=self.extra_modules_var, font=("Microsoft YaHei UI", 10))
        modules_entry.grid(row=2, column=0, columnspan=2, sticky=(tk.W, tk.E), pady=(0, 0))

        # 按钮框架
        button_frame = ttk.Frame(main_frame)
        button_frame.grid(row=2, column=0, pady=(0, 10))

        self.config_btn = ttk.Button(
            button_frame,
            text="开始配置",
            command=self.start_configuration,
            width=20
        )
        self.config_btn.grid(row=0, column=0, padx=5)

        # 日志框架
        log_frame = ttk.LabelFrame(main_frame, text="配置日志", padding="10")
        log_frame.grid(row=3, column=0, sticky=(tk.W, tk.E, tk.N, tk.S))
        log_frame.columnconfigure(0, weight=1)
        log_frame.rowconfigure(0, weight=1)

        # 日志文本框
        self.log_text = scrolledtext.ScrolledText(
            log_frame,
            wrap=tk.WORD,
            font=("Consolas", 9),
            height=15
        )
        self.log_text.grid(row=0, column=0, sticky=(tk.W, tk.E, tk.N, tk.S))

        # 配置日志标签颜色
        self.log_text.tag_configure("INFO", foreground="#0066cc")
        self.log_text.tag_configure("WARN", foreground="#ff9900")
        self.log_text.tag_configure("ERROR", foreground="#cc0000")
        self.log_text.tag_configure("SUCCESS", foreground="#009900")
        self.log_text.tag_configure("DEFAULT", foreground="#333333")

        # 清空日志按钮
        clear_log_btn = ttk.Button(
            log_frame,
            text="清空日志",
            command=self.clear_log,
            width=10
        )
        clear_log_btn.grid(row=1, column=0, pady=(5, 0))

        # 状态栏
        self.status_var = tk.StringVar(value="就绪")
        status_bar = ttk.Label(main_frame, textvariable=self.status_var, relief=tk.SUNKEN, anchor=tk.W)
        status_bar.grid(row=4, column=0, sticky=(tk.W, tk.E), pady=(10, 0))

        # 启动日志更新
        self.update_log()

    def browse_directory(self):
        """浏览并选择目录"""
        directory = filedialog.askdirectory(title="选择 Android 项目根目录")
        if directory:
            self.project_path_var.set(directory)

    def append_log(self, level, message):
        """添加日志到队列"""
        self.log_queue.put((level, message))

    def update_log(self):
        """更新日志显示"""
        try:
            while True:
                level, message = self.log_queue.get_nowait()
                tag = level if level in ["INFO", "WARN", "ERROR", "SUCCESS"] else "DEFAULT"
                prefix = f"[{level}] " if level != "DEFAULT" else ""
                self.log_text.insert(tk.END, f"{prefix}{message}\n", tag)
                self.log_text.see(tk.END)
        except queue.Empty:
            pass
        self.root.after(100, self.update_log)

    def clear_log(self):
        """清空日志"""
        self.log_text.delete(1.0, tk.END)

    def log(self, level: str, message: str):
        """输出日志"""
        self.append_log(level, message)

    def start_configuration(self):
        """开始配置"""
        if self.config_funcs is None:
            messagebox.showerror("错误", "配置模块加载失败，请检查安装！")
            return

        project_path = self.project_path_var.get().strip()

        if not project_path:
            messagebox.showwarning("警告", "请先选择 Android 项目目录！")
            return

        # 检查目录是否有效
        project_root = Path(project_path)
        if not (project_root / "app" / "build.gradle").exists():
            messagebox.showerror(
                "错误",
                f"这不是一个有效的 Android 项目！\n\n未找到: {project_root / 'app' / 'build.gradle'}"
            )
            return

        # 在新线程中执行配置
        self.config_btn.config(state=tk.DISABLED)
        self.status_var.set("配置中...")
        self.clear_log()

        thread = threading.Thread(target=self.run_configuration, args=(project_root,))
        thread.daemon = True
        thread.start()

    def run_configuration(self, project_root: Path):
        """运行配置（在后台线程中）"""
        try:
            self.log("INFO", "=" * 50)
            self.log("INFO", "Android 项目远程签名自动配置")
            self.log("INFO", "=" * 50)
            self.log("INFO", f"项目路径: {project_root}")
            self.log("INFO", "")

            script_dir = get_script_dir()

            # 1. 创建 .env.example
            self.log("INFO", "[1/5] 创建 .env.example 文件...")
            result = self.config_funcs['create_env_example'](project_root)
            if not result:
                self.log("ERROR", "配置失败：创建 .env.example 失败")
                self.finish_configuration(False)
                return
            self.log("SUCCESS", "创建 .env.example")

            # 2. 更新 .gitignore
            self.log("INFO", "[2/5] 更新 .gitignore 文件...")
            result = self.config_funcs['update_gitignore'](project_root)
            if not result:
                self.log("ERROR", "配置失败：更新 .gitignore 失败")
                self.finish_configuration(False)
                return
            self.log("SUCCESS", "更新 .gitignore")

            # 3. 更新 gradle.properties
            self.log("INFO", "[3/5] 更新 gradle.properties 文件...")
            result = self.config_funcs['update_gradle_properties'](project_root)
            if not result:
                self.log("ERROR", "配置失败：更新 gradle.properties 失败")
                self.finish_configuration(False)
                return
            self.log("SUCCESS", "更新 gradle.properties")

            # 4. 更新 app/build.gradle（以及额外模块）
            extra_modules_text = self.extra_modules_var.get().strip()
            extra_modules = [
                m.strip() for m in extra_modules_text.split(",") if m.strip()
            ] if extra_modules_text else []
            all_modules = ["app"] + extra_modules
            total_modules = len(all_modules)

            for idx, module_name in enumerate(all_modules, start=1):
                self.log("INFO", f"[4/5] ({idx}/{total_modules}) 更新 {module_name}/build.gradle 文件...")
                result = self.config_funcs['update_app_build_gradle'](project_root, module_name)
                if not result:
                    self.log("WARN", f"模块 {module_name} 配置失败，继续处理其他模块")
                else:
                    self.log("SUCCESS", f"更新 {module_name}/build.gradle")

            # 5. 复制脚本文件（在 GUI 中直接实现）
            self.log("INFO", "[5/5] 复制脚本文件到 scripts/ 目录...")
            if not self.copy_scripts(project_root, script_dir):
                self.log("ERROR", "配置失败：复制脚本文件失败")
                self.finish_configuration(False)
                return

            self.log("SUCCESS", "=" * 50)
            self.log("SUCCESS", "配置完成！")
            self.log("SUCCESS", "=" * 50)
            self.log("INFO", "")
            self.log("INFO", "下一步操作：")
            self.log("INFO", "1. 复制 .env.example 为 .env")
            self.log("INFO", "2. 编辑 .env 文件，填入 SIGN_TOKEN")
            self.log("INFO", "3. 确保 Python 已安装 requests 库: pip install requests")
            self.log("INFO", "4. 构建项目即可自动签名")

            self.finish_configuration(True)

        except Exception as e:
            self.log("ERROR", f"配置失败：{e}")
            import traceback
            self.log("ERROR", traceback.format_exc())
            self.finish_configuration(False)

    def copy_scripts(self, project_root: Path, script_dir: Path) -> bool:
        """复制脚本文件到目标项目"""
        scripts_dir = project_root / "scripts"
        scripts_dir.mkdir(parents=True, exist_ok=True)

        script_files = ["sign_apk.py", "build.py"]

        try:
            for script_name in script_files:
                # 尝试从多个位置查找源文件
                source_file = None
                possible_locations = [
                    script_dir / script_name,  # 正常情况
                    Path(__file__).parent / script_name,  # 备选位置
                ]

                for loc in possible_locations:
                    if loc and loc.exists():
                        source_file = loc
                        break

                if source_file is None or not source_file.exists():
                    self.log("ERROR", f"找不到源文件: {script_name}")
                    self.log("INFO", f"当前脚本目录: {script_dir}")
                    self.log("INFO", f"__file__ 位置: {Path(__file__).parent}")
                    return False

                target_file = scripts_dir / script_name
                shutil.copy2(source_file, target_file)
                self.log("SUCCESS", f"复制 {script_name} 到 scripts/")

            return True
        except Exception as e:
            self.log("ERROR", f"复制脚本文件失败: {e}")
            import traceback
            self.log("ERROR", traceback.format_exc())
            return False

    def finish_configuration(self, success: bool):
        """配置完成"""
        if success:
            self.status_var.set("配置完成")
            messagebox.showinfo("成功", "Android 项目远程签名配置完成！")
        else:
            self.status_var.set("配置失败")
            messagebox.showerror("失败", "配置过程中出现错误，请查看日志。")
        self.config_btn.config(state=tk.NORMAL)


def main():
    root = tk.Tk()

    # 设置主题样式
    style = ttk.Style()
    style.theme_use('clam')

    # 自定义按钮样式
    style.configure(
        "TButton",
        font=("Microsoft YaHei UI", 10),
        padding=8
    )

    app = ConfigToolGUI(root)
    root.mainloop()


if __name__ == "__main__":
    main()
