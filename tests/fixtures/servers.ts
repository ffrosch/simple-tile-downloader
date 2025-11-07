export default {
    qgisServer: {
        baseUrl: "http://localhost:8001",
        wmtsUrl: "/ogc/?SERVICE=WMTS&VERSION=1.0.0",
        wmtsLayers: ["LayerGroup", "countries", "places"],
        wmtsLayersUnavailable: ["airports", "countries_shapeburst"],
        wmtsMatrixSets: ["EPSG:4326", "EPSG:3857"],
    }
}