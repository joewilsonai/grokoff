// GrokOff fixture teardown: a daemon may outlive its worker and inherit pipes.
// This retires only the parent's streams after the exact worker has exited.
export function boundBrowserWorkerStreamDrain(child, graceMs = 250) {
  let timer;
  const clear = () => { clearTimeout(timer); child.off("exit", exited); };
  const exited = () => {
    timer = setTimeout(() => {
      child.stdout?.destroy();
      child.stderr?.destroy();
    }, graceMs);
  };
  child.once("close", clear);
  child.once("error", clear);
  if (child.exitCode !== null || child.signalCode !== null) exited();
  else child.once("exit", exited);
}
