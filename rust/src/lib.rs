use wasm_bindgen::prelude::*;
use rstar::primitives::{Line, GeomWithData};
use rstar::{RTree, PointDistance};

// When the `wee_alloc` feature is enabled, use `wee_alloc` as the global
// allocator.
#[cfg(feature = "wee_alloc")]
#[global_allocator]
static ALLOC: wee_alloc::WeeAlloc = wee_alloc::WeeAlloc::INIT;

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

