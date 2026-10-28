/**
 * The part of Node's `WebAssembly` the sandbox uses. Node's types declare the namespace but leave
 * its members to the DOM's types, and the server has no DOM: this adds the memory to it.
 */
// biome-ignore lint/style/noNamespace: `WebAssembly` is a namespace of the platform; adding to it takes one.
declare namespace WebAssembly {
  interface MemoryDescriptor {
    /** In pages of 64 KiB. */
    initial: number;
    /** In pages of 64 KiB: the engine refuses to grow past it. */
    maximum?: number;
  }

  interface Memory {
    readonly buffer: ArrayBuffer;
  }

  const Memory: {
    prototype: Memory;
    new (descriptor: MemoryDescriptor): Memory;
  };
}
