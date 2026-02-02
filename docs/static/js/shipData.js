// Minimal seed data: only MMSI, threat score, AIS flag, and coordinates.
(function () {
    window.SHIP_DATA = [
        {
            id: "mmsi-12345678",
            slot: "left-region",
            mmsi: "412001767",
            threatScore: 90,
            aisFlag: false,
            coords: { lat: 16.782, lng: 114.512 },
        },
        {
            id: "mmsi-52378231",
            slot: "left-region",
            mmsi: "412001767",
            threatScore: 75,
            aisFlag: false,
            coords: { lat: 15.956, lng: 116.202 },
        },
        {
            id: "mmsi-98236402",
            slot: "left-region",
            mmsi: "412001264",
            threatScore: 59,
            aisFlag: false,
            coords: { lat: 14.832, lng: 117.045 },
        },
        {
            id: "track-88654321",
            slot: "left-region",
            mmsi: "412000588",
            threatScore: 88,
            aisFlag: false,
            coords: { lat: 22.406, lng: 119.315 },
        },
        {
            id: "track-77543210",
            slot: "left-region",
            mmsi: "412001684",
            threatScore: 72,
            aisFlag: false,
            coords: { lat: 25.244, lng: 119.533 },
        },
    ];
})();
