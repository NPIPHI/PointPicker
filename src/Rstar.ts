import { LineString, MultiLineString, Point } from "ol/geom";
import { DbfFeature, Shapefile } from "./Shapefile";

type WasmRstar = typeof import("../rust/pkg");

let _cache_rstar : WasmRstar;

export async function get_rstar(): Promise<WasmRstar>{
    if(!_cache_rstar){
        _cache_rstar = await (await import("../rust/pkg")).default;
    }
    return _cache_rstar;
}

function line_to_flat(l: LineString, idx: number): number[]{
    const coords = l.getCoordinates();
    let arr: number[] = [];
    for(let i = 0; i < coords.length - 1; i ++){
        arr.push(coords[i][0]);
        arr.push(coords[i][1]);
        arr.push(coords[i+1][0]);
        arr.push(coords[i+1][1]);
        arr.push(idx)
    }
    return arr;
}

export async function nearest_segments(points: Shapefile, segments: Shapefile): Promise<Map<DbfFeature, {seg: DbfFeature, dist: number}>> {
    const points_arr = new Float64Array(points.features.flatMap(f=>(f.getGeometry() as Point).getFlatCoordinates()));
    const lines_arr = new Float64Array(segments.features.flatMap((f, i)=>{
        const geo = f.getGeometry();
        if(geo instanceof LineString){
            return line_to_flat(geo, i);
        } else if(geo instanceof MultiLineString){
            return geo.getLineStrings().flatMap(l => line_to_flat(l, i));
        } else {
            throw "unexpected segment type";
        }
    }));

    const rstar = await get_rstar();
    const associations = rstar.compute_nearest(lines_arr, points_arr);

    let ret = new Map();

    for(let i = 0; i < associations.length / 2; i++){
        ret.set(points.features[i], {seg: segments.features[associations[i*2]], dist: associations[i*2+1]});
    }

    return ret;
}