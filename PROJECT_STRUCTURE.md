# AI-System-Ship Project Structure

## 📁 Project Overview
Event-driven RF monitoring system with maritime surveillance capabilities.

## 🗂️ Directory Structure

```
AI-System-Ship/
├── UIUX/                          # Main UI/UX Implementation
│   ├── index.html                 # Main application interface
│   ├── script.js                  # Core JavaScript functionality
│   ├── styles.css                 # Main stylesheet
│   └── _old/                      # Legacy implementations
│       ├── improved/
│       ├── maritime-ui/
│       ├── maritime-ui-claude/
│       ├── maritime-surveillance-ui-claude/
│       └── simple_uiux/
├── CLAUDE.md                      # Project instructions & guidelines
└── PROJECT_STRUCTURE.md           # This file
```

## 🎯 Core Components

### Main Interface (`index.html`)
- **Events Sidebar**: Event card management (AREA, RF, VESSEL types)
- **Map Section**: Interactive Taiwan maritime map with Leaflet.js
- **Details Panel**: Dynamic event details display
- **Mission Timeline**: Task management and progress tracking
- **Modal Systems**: 
  - New event creation modal
  - Action decision modal

### JavaScript Architecture (`script.js`)

#### 🏗️ Core Systems
```javascript
// Event Management
- selectEvent()              // Event card selection
- eventStorage              // Local storage handler
- createNewEvent()          // Event creation workflow

// Event Types
- getAreaEventDetailsFromStorage()    // Area monitoring events
- getRFEventDetailsFromStorage()      // RF anomaly events  
- getVesselEventDetailsFromStorage()  // Vessel monitoring events

// Action Systems
- selectAction()            // Action button handling (both modal & vessel)
- toggleActionOption()      // Multi-select vessel actions
- executeAction()           // Action execution
- executeVesselActions()    // Vessel-specific action execution

// Mission Management
- createMissionFromAction() // Convert actions to missions
- Mission timeline updates

// Map Integration
- Taiwan maritime map with Leaflet.js
- Dynamic markers for events
- Interactive popup system
```

#### 🎨 UI Components
```javascript
// Event Cards
- Dynamic event generation
- Status indicators (investigating, analyzed, completed)
- Risk scoring system

// Decision Recommendation System (Vessel Monitoring)
- getVesselDecisionRecommendation() // AI-driven recommendations
- Risk-based priority assessment
- Evidence analysis display

// Multi-Action Selection (Vessel)
- toggleActionOption()      // Toggle selection state
- selectedVesselActions     // Set-based storage
- Visual feedback with checkboxes
```

### Styling System (`styles.css`)

#### 🎨 Design System
```css
/* Core Layout */
.system-layout              // Main grid layout
.events-sidebar             // Left panel
.map-section               // Center map area
.details-panel             // Right panel
.mission-section           // Bottom timeline

/* Event Components */
.event-card                // Event card styling
.event-type-badge          // Type indicators
.risk-score-container      // Risk display

/* Action Systems */
.action-btn                // Basic action buttons
.action-btn.selected       // Selected state (blue gradient)
.action-option             // Multi-select options (vessel)
.action-option.selected    // Selected vessel actions
.type-option               // Modal action options
.type-option.selected      // Selected modal actions

/* Vessel Monitoring */
.decision-recommendation   // AI recommendation display
.action-options           // Multi-select container
.vessel-action-buttons    // Cancel/Execute buttons
```

## 🚢 Event Types & Workflows

### 1. Area Monitoring Events (AREA-XXX)
- **Purpose**: Regional RF anomaly detection
- **Input**: AOI coordinates, monitoring duration
- **Output**: RF candidate list for investigation
- **Actions**: Create RF events from candidates

### 2. RF Anomaly Events (RF-XXX)
- **Purpose**: Specific RF signal investigation
- **Input**: RF signal ID, detection time
- **Output**: Signal analysis and vessel correlation
- **Actions**: Create vessel monitoring, satellite imaging

### 3. Vessel Monitoring Events (VESSEL-XXX)
- **Purpose**: Ship behavior analysis and risk assessment
- **Input**: MMSI, coordinates, investigation reason
- **Output**: Risk score, decision recommendations
- **Actions**: Multi-select system (track, satellite, notify, UAV)

## ⚡ Key Features

### Decision Recommendation System
```javascript
getVesselDecisionRecommendation(threatScore, eventData)
```
- **Risk-based recommendations**: 80+ (urgent UAV), 60+ (satellite), 40+ (tracking), <40 (notify)
- **Evidence analysis**: AIS status, route deviation, RF behavior
- **Priority classification**: Emergency, High, Medium, Low

### Multi-Action Selection (Vessel Monitoring)
- **4 Action Options**: Track, Satellite, Notify, UAV dispatch
- **Multi-select capability**: Can select multiple actions simultaneously
- **Visual feedback**: Blue background + checkmark for selected options
- **Execution flow**: Cancel/Execute with confirmation dialog

### Action Color System
- **Modal Actions** (`.type-option`): Uses `selectAction()` with single selection
- **Vessel Actions** (`.action-btn`): Uses `selectAction()` with single selection  
- **Vessel Multi-Actions** (`.action-option`): Uses `toggleActionOption()` with multi-selection

## 🗄️ Data Management

### Event Storage
```javascript
eventStorage = {
    saveEvent(id, data),    // Store event data
    getEvent(id),           // Retrieve event data  
    updateEvent(id, data),  // Update event data
    // Stores: type, coordinates, threatScore, createTime, etc.
}
```

### Dynamic Content Generation
- **Real-time coordinate generation**: Marine coordinates within Taiwan waters
- **Risk scoring**: Multi-factor analysis for vessel assessment
- **Mission creation**: Automatic task generation from user actions

## 🚀 Usage Flow

1. **Select Event Type** → Create new event (Area/RF/Vessel)
2. **Event Investigation** → View details in right panel
3. **Decision Making** → 
   - Area: Create RF events from candidates
   - RF: Create vessel monitoring or take actions
   - Vessel: Multi-select actions based on AI recommendations
4. **Action Execution** → Creates missions in timeline
5. **Mission Tracking** → Monitor progress in bottom panel

## 🔧 Technical Notes

### Dependencies
- **Leaflet.js**: Interactive mapping
- **Vanilla JavaScript**: No framework dependencies
- **CSS Grid/Flexbox**: Responsive layout system

### Browser Compatibility
- Modern browsers with ES6+ support
- LocalStorage for data persistence
- CSS Grid and Flexbox support required

### Performance Considerations
- Event delegation for dynamic content
- Efficient DOM queries with specific selectors
- Minimal external dependencies