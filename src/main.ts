import Map from "ol/Map"
import TileLayer from "ol/layer/Tile";
import OSM from "ol/source/OSM";
import View from "ol/View"

const map = new Map({
    target: 'map',
    controls: [],
    layers: [
        new TileLayer({
            source: new OSM({ attributions: null })
        })
    ],
    view: new View({
        center: [0, 0],
        zoom: 1
    })
});
