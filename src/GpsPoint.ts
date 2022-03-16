import Feature from "ol/Feature";
import Point from "ol/geom/Point";
import { toLonLat } from "ol/proj";
import { DbfFeature } from "./Shapefile";


export class GpsPoint {
    private feature: Feature<Point>;
    fis_count: number;
    route: string;
    section_id: number | null;

    constructor(feature: DbfFeature){
        if(feature.getGeometry().getType() != "Point"){
            throw "Non Point Geometry";
        } else {
            this.feature = feature as Feature<Point>;
            this.fis_count = feature.dbf_properties.FIS_Count;
            this.route = feature.dbf_properties.Route;
            this.section_id = null;
        }
    }

    x(){
        return this.feature.getGeometry().getFlatCoordinates()[0]
    }

    y(){
        return this.feature.getGeometry().getFlatCoordinates()[1]
    }

    lon_lat(){
        return toLonLat(this.feature.getGeometry().getFlatCoordinates());
    }

    static from_array(features: DbfFeature[]): GpsPoint[] {
        return features.map(f=>new GpsPoint(f));
    }
}