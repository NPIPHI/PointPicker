use wasm_bindgen::prelude::*;
use rstar::primitives::{Line, GeomWithData};
use rstar::{RTree, PointDistance};

type LineWithIdx = GeomWithData<Line<[f64;2]>, f64>;
#[wasm_bindgen]
pub fn compute_nearest(lines: Vec<f64>, points: Vec<f64>) -> Vec<f64> {
    let lines = lines.chunks_exact(5).map(|x| LineWithIdx::new(Line::new([x[0],x[1]],[x[2],x[3]]), x[4])).collect();
    let tree = RTree::bulk_load(lines);

    return points.chunks_exact(2).flat_map(|pt|{
        // no const generics :(
        let pt = &[pt[0],pt[1]];
        let nearest = tree.nearest_neighbor(pt).unwrap();
        return [nearest.data, nearest.geom().distance_2(pt).sqrt()];
    }).collect();
}

struct DbfDescriptor {
    start_ptr: u32,
    step: u32,
    count: u32,
    _padding: u32,
    fields: Vec<(u32, u32)>
}

fn parse_float(buf: &[u8]) -> Option<f64> {
    for i in 0..buf.len() {
        if buf[i] != ' ' as u8 {
            return fast_float::parse(&buf[i..]).ok();
        }
    }

    return None;
}

#[wasm_bindgen]
pub fn dbf_extract_numbers(buf: Vec<u8>, descriptor: Vec<u32>) -> Vec<f64> {
    let buf = buf.as_slice();
    let des = DbfDescriptor{
        start_ptr: descriptor[0],
        step: descriptor[1],
        count: descriptor[2],
        _padding: descriptor[3],
        fields: descriptor.chunks_exact(2).skip(2).map(|x| (x[0], x[1])).collect()
    };

    (0..des.count).into_iter().flat_map(|i|{
        let row_ptr = des.start_ptr + des.step * i;
        return des.fields.iter().map( move |(b, e)|{
            parse_float(&buf[(row_ptr + b) as usize .. (row_ptr + e) as usize]).unwrap_or(f64::NAN)
        })
    }).collect()
}

