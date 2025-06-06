declare module 'debug' {
  function debug(namespace: string): (...args: any[]) => void;
  export default debug;
}
