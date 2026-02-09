/* UIUX data structure definition */
const UIUX_DATA_SCHEMA = {
    region: {
        center: { lat: 0, lng: 0 },
        radiusNm: 0,
    },
    vessels: [
        {
            mmsi: "",
            vesselType: 0,
            aisFlag: true || false,
            status: ["tracking", "dispatch", "suspicious"],
            coord: { lat: 23.9995, lng: 119.5044 },
            imoNum: "",
            navStatus: "",
            cog: 0,
            sog: 0,
            rfFreq: "",
            accuracy: "",
            pulsesDuration: "",
            pulsesFreq: "",
            waveform: "",

            // Threat assessment fields
            threat: { score: 0 },
            threatDetails: {
                meandering: {
                    _id: "",
                    riskScore: 0,
                    analysisPeriod: {start: "", end: "",},
                    meanderingCount: 0,
                    totalMeanderingDuration: 0,
                    totalMeanderingScore: 0,
                    f_crit: 0,
                    segmentsDetails: [],
                    message: "",
                    mmsi: "",
                    createdAt: "",
                },
                loitering: {
                    _id: "",
                    riskScore: 0,
                    startTime: null,
                    loiterTimeMinutes: 0,
                    thresholds: {t1: 0},
                    loiterArea: {
                        center: {lat: 0,lon: 0},
                        radius: 0,
                    },
                    message: "",
                    mmsi: "",
                    createdAt: "",
                },
                speedDrop: {
                    _id: "",
                    riskScore: 0,
                    timeWindow: {startTime: "", endTime: "",},
                    dropCount: 0,
                    totalDropAcceleration: 0,
                    thresholds: {a_free: 0, a_full: 0,},
                    dropEvents: [],
                    message: "",
                    mmsi: "",
                    createdAt: "",
                },
                aisSwitch: {
                    _id: "",
                    riskScore: 0,
                    timeWindow: {startTime: "", endTime: "",},
                    totalNormalPoints: 0,
                    missingCountInArea: 0,
                    missingRatio: 0,
                    thresholds: {p_free: 0, p_full: 0,},
                    affectedAreas: [],
                    message: "",
                    mmsi: "",
                    createdAt: "",
                },
            },
            // Trajectory 
            trajectory: [
                { lat: 0, lng: 0, time: "" }
            ],
            // Dispatch mission details
            dispatch: {
                _id: "",
                imageDir: "",
                dispatchTime: "",
                excuteTime: "",
                action: "",
                dispatchCoord: [0, 0],
                excuteCoord: [0, 0],
                status: "scheduled | queued | running | done",
            },
        },
    ],
    stats: {
        aisOn: 0,
        aisOff: 0,
        threatHigh: 0,
        threatMedium: 0,
        threatLow: 0,
    },
};

if (typeof window !== "undefined") {
    window.UIUX_DATA_SCHEMA = UIUX_DATA_SCHEMA;
}

/*

    suspiciousVessels: [
        {
            mmsi: "41200002",
            threat: { score: null },
            aisFlag: true,
            coord: [23.9995, 119.5044],
        },
    ],

*/

