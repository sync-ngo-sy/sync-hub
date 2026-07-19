from __future__ import annotations

import json
import os
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request


def _available_port() -> int:
    with socket.socket() as server:
        server.bind(("127.0.0.1", 0))
        return int(server.getsockname()[1])


def test_installed_worker_processes_start_outside_repository(tmp_path) -> None:
    environment = {
        "PATH": os.environ.get("PATH", ""),
        "PYTHONUNBUFFERED": "1",
    }
    cli = subprocess.run(
        [sys.executable, "-m", "cv_intelligence_worker", "--help"],
        cwd=tmp_path,
        env=environment,
        capture_output=True,
        text=True,
        timeout=10,
    )
    assert cli.returncode == 0, cli.stderr
    assert "Offline worker for the CV Intelligence Platform" in cli.stdout

    prompt = subprocess.run(
        [
            sys.executable,
            "-c",
            "from cv_intelligence_worker.candidate_extraction import build_candidate_system_prompt; assert 'Output schema:' not in build_candidate_system_prompt()",
        ],
        cwd=tmp_path,
        env=environment,
        capture_output=True,
        text=True,
        timeout=10,
    )
    assert prompt.returncode == 0, prompt.stderr

    cleanup = subprocess.run(
        [
            sys.executable,
            "-c",
            "from cv_intelligence_worker.draft_validation import build_draft_validation_system_prompt; "
            "from cv_intelligence_worker.prompts import load_prompt_template; "
            "from cv_intelligence_worker.skill_cleanup import SkillClassifier, build_plan; "
            "assert 'Output schema:' not in build_draft_validation_system_prompt(); "
            "assert 'factual recruiter-facing summary' in load_prompt_template('candidate_summary').render(); "
            "assert 'Compare the supplied' in load_prompt_template('candidate_comparison').render(); "
            "assert 'Classify every supplied item' in SkillClassifier.system_prompt(); assert build_plan",
        ],
        cwd=tmp_path,
        env=environment,
        capture_output=True,
        text=True,
        timeout=10,
    )
    assert cleanup.returncode == 0, cleanup.stderr

    port = _available_port()
    process = subprocess.Popen(
        [
            sys.executable,
            "-m",
            "uvicorn",
            "cv_intelligence_worker.realtime_extractor:app",
            "--host",
            "127.0.0.1",
            "--port",
            str(port),
        ],
        cwd=tmp_path,
        env=environment,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    payload = None
    try:
        deadline = time.monotonic() + 10
        while time.monotonic() < deadline and process.poll() is None:
            try:
                with urllib.request.urlopen(f"http://127.0.0.1:{port}/health", timeout=1) as response:
                    payload = json.load(response)
                    break
            except urllib.error.URLError:
                time.sleep(0.1)
    finally:
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=5)

    output = process.stdout.read() if process.stdout else ""
    assert payload == {"status": "ok"}, output
