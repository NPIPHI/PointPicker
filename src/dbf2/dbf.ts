import { get_wasm } from "../WasmModule";

type FieldDescriptor = {
    name: string,
    type: number,
    length: number,
    decimal_count: number
};

type Row = {
    [key: string] : string | boolean | number | Date | null;
}

function decode_name(buffer: Uint8Array, begin: number, end: number, decoder: TextDecoder) : string{
    const name = decoder.decode(buffer.subarray(begin, end));
    const end_idx = name.indexOf('\x00');
    return name.slice(0, end_idx);
}

function parse_header(buffer: Uint8Array, ptr: number, decoder: TextDecoder): FieldDescriptor | null {
    if(buffer[ptr] == 0x0D) return null;
    const name = decode_name(buffer, ptr, ptr + 11, decoder);
    const type = buffer[ptr + 11];
    const length = buffer[ptr + 16];
    const decimal_count = buffer[ptr + 17];

    return {name, type, length, decimal_count};
}

function is_numeric_field(field_type: number){
    return field_type == 66 || field_type == 77 || field_type == 78 || field_type == 70;
}

// B: readNumber,
// C: readString,
// D: readDate,
// F: readNumber,
// L: readBoolean,
// M: readNumber,
// N: readNumber

function parse_field(buffer: Uint8Array, ptr: number, decoder: TextDecoder, field: FieldDescriptor, numbers: Float64Array | null, numbers_ptr: number): string | boolean | number | Date | null {
    if(numbers && is_numeric_field(field.type)) return numbers[numbers_ptr];
    
    const str = decoder.decode(buffer.subarray(ptr, ptr + field.length));
    switch(field.type){
        // Numeric Types
        case 66:
        case 77:
        case 78:
        case 70:
            const num = parseFloat(str.trim());
            return isNaN(num) ? null : num;

        // Date
        case 68:
            return new Date(+str.substring(0, 4), +str.substring(4,6) - 1, +str.substring(6, 8));

        // Boolean
        case 76:
            if(str == 'n' || str == 'f' || str == 'N' || str == 'F'){
                return false;
            } else if(str == 'y' || str == 't' || str == 'Y' || str == 'T') {
                return true;
            } else {
                return null;
            }
        // String
        case 67:
            return str.trim() || null;
    }

    throw new Error(`Bad field type ${field.type}`);
}

function parse_row(buffer: Uint8Array, ptr: number, decoder: TextDecoder, fields : FieldDescriptor[], numbers: Float64Array | null, numbers_ptr: number): [Row, number] {
    let row: Row = {};
    
    for(let i = 0; i < fields.length; i++){
        row[fields[i].name] = parse_field(buffer, ptr, decoder, fields[i], numbers, numbers_ptr);
        if(is_numeric_field(fields[i].type)) numbers_ptr++;
        ptr += fields[i].length;
    }

    return [row, numbers_ptr];
}

function readu32(buffer: Uint8Array, ptr: number){
    return buffer[ptr] 
    + buffer[ptr + 1] * (1 << 8)
    + buffer[ptr + 2] * (1 << 16)
    + buffer[ptr + 3] * (1 << 24)
}

function readu16(buffer: Uint8Array, ptr: number){
    return buffer[ptr] 
    + buffer[ptr + 1] * (1 << 8)
}


type WasmDescriptor = Uint32Array;
function make_wasm_descriptor(first_record_ptr: number, bytes_per_record: number, row_count: number, fields: FieldDescriptor[]) : WasmDescriptor {

    /*

struct DbfDescriptor {
    start_ptr: u32,
    step: u32,
    count: u32,
    _padding: u32,
    fields: Vec<(u32, u32)>
}

    */

    const field_descriptors: number[] = [];


    let field_ptr = 0;
    fields.forEach(f=>{
        if(is_numeric_field(f.type)){
            field_descriptors.push(field_ptr, field_ptr + f.length);
        }
        field_ptr += f.length;
    });

    return new Uint32Array([first_record_ptr, bytes_per_record, row_count, 0, ...field_descriptors]);
}

export async function parse(buffer: ArrayBuffer): Promise<Row[]> {
    const view = new Uint8Array(buffer);
    
    const row_count = readu32(view, 4);

    //1 byte for is deleted flag
    const first_record_ptr = readu16(view, 8) + 1;
    const bytes_per_record = readu16(view, 10);

    const decoder = new TextDecoder("windows-1252");

    //start ptr at first field descriptor
    let fields = [];
    for(let ptr = 32, field = null; field = parse_header(view, ptr, decoder); ptr += 32){
        fields.push(field);
    }
  
    const wasm_descriptor = make_wasm_descriptor(first_record_ptr, bytes_per_record, row_count, fields);
    const wasm = await get_wasm();
    const numbers = wasm.dbf_extract_numbers(view, wasm_descriptor);
    let rows = [];
    let numbers_ptr = 0;

    for(let i = 0; i < row_count; i++){
        const [row, next_number_ptr] = parse_row(view, first_record_ptr + bytes_per_record * i, decoder, fields, numbers, numbers_ptr);
        numbers_ptr = next_number_ptr;
        rows.push(row);
    }

    return rows;
}