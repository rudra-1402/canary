import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const intelligenceDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../intelligence',
);

function enabled() {
  if (process.env.RESCORE_ON_CONCLUSION_ENABLED === undefined) {
    return process.env.NODE_ENV !== 'test';
  }
  return ['1', 'true'].includes(process.env.RESCORE_ON_CONCLUSION_ENABLED.toLowerCase());
}

function timeoutMs() {
  const configured = Number(process.env.RESCORE_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0 ? configured : 30000;
}

function configuration() {
  const workingDirectory = process.env.RESCORE_WORKING_DIRECTORY || intelligenceDirectory;
  return {
    python:
      process.env.RESCORE_PYTHON || path.join(workingDirectory, 'venv', 'Scripts', 'python.exe'),
    module: process.env.RESCORE_MODULE || 'trust_score.rescore',
    artifact:
      process.env.RESCORE_ARTIFACT || path.join(workingDirectory, 'trust-score-model.b4.joblib'),
    workingDirectory,
  };
}

// This is deliberately fire-and-forget: a failed or slow score leaves the existing stale snapshot
// in place, while the already-correct Outcome and Review response remains successful.
export function triggerRescoreOnConclusion(freelancerProfileId, clientProfileId) {
  if (!enabled()) return;

  const config = configuration();
  const args = [
    '-m',
    config.module,
    String(freelancerProfileId),
    String(clientProfileId),
    '--artifact',
    config.artifact,
  ];
  let child;
  try {
    child = spawn(config.python, args, {
      cwd: config.workingDirectory,
      stdio: ['ignore', 'ignore', 'pipe'],
      windowsHide: true,
    });
  } catch (error) {
    console.error(`Trust Score rescore could not start: ${error.message}`);
    return;
  }

  const timer = setTimeout(() => {
    console.error(`Trust Score rescore timed out after ${timeoutMs()}ms`);
    child.kill();
  }, timeoutMs());
  timer.unref();
  child.unref();
  let stderr = '';
  child.stderr?.on('data', (chunk) => {
    stderr += chunk;
  });
  child.once('error', (error) => {
    clearTimeout(timer);
    console.error(`Trust Score rescore process failed: ${error.message}`);
  });
  child.once('exit', (code, signal) => {
    clearTimeout(timer);
    if (code !== 0) {
      console.error(
        `Trust Score rescore exited unsuccessfully (code ${code}, signal ${signal}): ${stderr.trim()}`,
      );
    }
  });
}
