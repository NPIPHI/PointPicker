type WasmModule = typeof import("../rust/pkg");

let _cache_wasm : WasmModule;

export async function get_wasm(): Promise<WasmModule>{
    if(!_cache_wasm){
        _cache_wasm = await (await import("../rust/pkg")).default;
    }
    return _cache_wasm;
}