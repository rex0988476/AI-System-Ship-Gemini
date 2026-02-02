/**
 * Ship Data Structure Definition
 * 
 * This file defines the structure of ship objects used throughout the application.
 * Ships can come from multiple sources: static data, API responses, or user actions.
 */

/**
 * @typedef {Object} ShipCoordinates
 * @property {number} lat - Latitude (e.g., 23.974)
 * @property {number} lng - Longitude (e.g., 120.973)
 */

/**
 * @typedef {Object} ThreatInfo
 * @property {number|null} score - Threat score (0-100, or null for unknown)
 * @property {string} level - Threat level: "高風險", "中風險", "低風險", "未知風險"
 */

/**
 * @typedef {Object} RFData
 * @property {string} [frequency] - RF frequency (e.g., "9.4 GHz")
 * @property {string} [location] - Coordinate string (e.g., "23.974°, 120.973°")
 * @property {string} [status] - RF status (e.g., "最新蒐集")
 * @property {string} [pulseWidth] - Pulse width (e.g., "100 ns")
 * @property {string} [prf] - Pulse repetition frequency (e.g., "1000 Hz")
 * @property {string} [accuracy] - Accuracy percentage (e.g., "95%")
 */

/**
 * @typedef {Object} TrajectoryEntry
 * @property {number} lat - Latitude
 * @property {number} lng - Longitude
 * @property {number} hoursAgo - Hours ago from now (0 = current, 3 = 3 hours ago, etc.)
 */

/**
 * @typedef {Object} DispatchAction
 * @property {string} label - Action label (e.g., "衛星拍攝", "UAV偵查")
 * @property {string} schedule - Scheduled time in UTC format (e.g., "14:30Z")
 * @property {string} scheduleDate - ISO 8601 date string (e.g., "2025-12-29T14:30:00.000Z")
 * @property {string} status - Action status: "待派遣", "進行中", "完成"
 * @property {string} createdAt - ISO 8601 creation date
 */

/**
 * @typedef {Object} Ship
 * 
 * Core Identity
 * @property {string} id - Unique identifier (defaults to mmsi if not set)
 * @property {string} mmsi - Maritime Mobile Service Identity (e.g., "412001767")
 * @property {string} [name] - Ship name (defaults to "未知" if not available)
 * 
 * Location
 * @property {ShipCoordinates} coords - Current coordinates
 * @property {string} [coordinatesLabel] - Formatted coordinate string (e.g., "23.974°, 120.973°")
 * 
 * AIS Information
 * @property {string} ais - AIS status: "已開啟" or "未開啟"
 * @property {boolean} [aisFlag] - Boolean AIS flag (converted to ais string)
 * 
 * Threat Assessment
 * @property {ThreatInfo} threat - Threat information
 * 
 * Ship Details (from API)
 * @property {string} [shipType] - Vessel type (e.g., "Cargo", "Fishing", "Tanker")
 * @property {string} [imo] - IMO number (e.g., "9123456")
 * @property {string} [navStatus] - Navigation status (e.g., "Under way", "At anchor")
 * @property {number} [cog] - Course over ground in degrees (0-360)
 * @property {number} [sog] - Speed over ground in knots
 * 
 * RF (Radio Frequency) Data
 * @property {RFData} [rf] - Radio frequency detection data
 * 
 * Trajectory History
 * @property {TrajectoryEntry[]} [trajectory] - Historical position data
 * 
 * Status & Metadata
 * @property {string} [status] - Current status (e.g., "可疑船舶", "資料載入中…")
 * @property {string} [lastUpdate] - Last update timestamp
 * @property {string} [slot] - UI slot: "left-region", "left-tracking", "left-dispatch"
 * @property {string} [category] - Category: "region", "tracking", "dispatch"
 * @property {string} [event_status] - Event status: "追蹤中", "派遣中", etc.
 * 
 * Dispatch-specific
 * @property {DispatchAction} [action] - Dispatch action details
 * 
 * Flags
 * @property {boolean} [isSuspicious] - Marks suspicious vessels from API
 */

/**
 * Example ship object with all fields:
 */
const EXAMPLE_SHIP = {
    // Identity
    id: "mmsi-412001767",
    mmsi: "412001767",
    name: "貨輪一號",
    
    // Location
    coords: {
        lat: 23.974,
        lng: 120.973
    },
    coordinatesLabel: "23.974°, 120.973°",
    
    // AIS Information
    ais: "已開啟",
    aisFlag: true,
    
    // Threat Assessment
    threat: {
        score: 85,
        level: "高風險"
    },
    
    // Ship Details
    shipType: "Cargo",
    imo: "9123456",
    navStatus: "Under way using engine",
    cog: 245,
    sog: 12.5,
    
    // RF Data
    rf: {
        frequency: "9.4 GHz",
        location: "23.974°, 120.973°",
        status: "最新蒐集",
        pulseWidth: "100 ns",
        prf: "1000 Hz",
        accuracy: "95%"
    },
    
    // Trajectory History
    trajectory: [
        { lat: 23.974, lng: 120.973, hoursAgo: 0 },   // Current
        { lat: 23.970, lng: 120.970, hoursAgo: 3 },   // 3 hours ago
        { lat: 23.965, lng: 120.965, hoursAgo: 6 },   // 6 hours ago
        { lat: 23.960, lng: 120.960, hoursAgo: 12 },  // 12 hours ago
        { lat: 23.955, lng: 120.955, hoursAgo: 24 }   // 24 hours ago
    ],
    
    // Status & Metadata
    status: "可疑船舶",
    lastUpdate: "2025-12-29 10:30",
    slot: "left-region",
    category: "region",
    event_status: "追蹤中",
    
    // Dispatch-specific
    action: {
        label: "衛星拍攝",
        schedule: "14:30Z",
        scheduleDate: "2025-12-29T14:30:00.000Z",
        status: "待派遣",
        createdAt: "2025-12-29T08:30:00.000Z"
    },
    
    // Flags
    isSuspicious: true
};

/**
 * Minimal ship object (from static data):
 */
const MINIMAL_SHIP = {
    id: "mmsi-12345678",
    mmsi: "412001767",
    threat: {
        score: 90,
        level: "高風險"
    },
    aisFlag: false,
    coords: { lat: 16.782, lng: 114.512 },
    slot: "left-region"
};

/**
 * Data Sources:
 * 
 * 1. Static Data (window.SHIP_DATA from shipData.js)
 *    - Minimal seed data with id, mmsi, threat.score, aisFlag, coords, slot
 * 
 * 2. API Data (from http://140.115.53.51:3000/api/v1)
 *    - /vesselInfo?mmsi=xxx → Detailed ship info
 *    - /vesselTrack?mmsi=xxx → Trajectory history
 *    - /suspiciousVessels?lat=x&lon=y&radius=z → Suspicious vessels
 * 
 * 3. Generated/Computed
 *    - coordinatesLabel: Formatted from coords
 *    - threat.level: Computed from threat.score
 *    - ais: Converted from aisFlag boolean
 */

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        EXAMPLE_SHIP,
        MINIMAL_SHIP
    };
}
