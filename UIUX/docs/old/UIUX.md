# UIUX Directory Structure

## Threat assessment
已實現的威脅評估功能：
1. 颱風路徑式威脅等級：
- 🟢 北方 (⬆️) = 低威脅 - 遠離威脅區域
- 🟡 東方 (➡️) = 中等威脅 - 進入監控區域
- 🟠 南方 (⬇️) = 高威脅 - 接近威脅區域
- 🔴 西方 (⬅️) = 極高威脅 - 進入危險區域
2. AIS訊號中斷威脅升級機制：
- 單次AIS中斷：+25分威脅值
- 連續2次中斷：額外+25分
- 連續3次以上：額外+40分
3. 綜合威脅評估指標：
- AIS訊號強度異常
- 航行速度異常（超速/異常停留）
- 航線偏離程度
- 禁航區域入侵
- 夜間活動加權
4. 已成功更新威脅評估系統，現在改採「以台灣為中心」的颱風路徑威脅評估方式！
🇹🇼 台灣中心威脅評估系統更新完成：
新威脅等級定義：
- 🟢 低威脅 (東方) - 東方外海，遠離台灣
- 🟡 中等威脅 (北方) - 北方海域，接近台海
- 🟠 高威脅 (南方) - 南方海域，接近台灣南部
- 🔴 極高威脅 (西方) - 直指台灣本島方向
距離台灣威脅分級：
- <50km：極接近台灣本島 (+60分)
- <100km：接近台灣海域 (+40分)
- <200km：進入台海周邊 (+20分)
- <300km：台海外圍區域 (+10分)
新增功能：
1. 實時計算船舶距離台灣的精確距離
2. 基於距離的動態威脅評分機制
3. 軌跡點詳情顯示距離台灣資訊
4. 威脅方向指示器更新為台灣地理方位
測試服務器運行中：http://localhost:8000
點擊任何船舶軌跡點即可看到新的台灣中心威脅評估系統！

## 📁 UIUX/ Directory Overview

```
UIUX/
├── index.html                     # Main application interface
├── script.js                      # Core JavaScript functionality (33k+ lines)
├── styles.css                     # Main stylesheet (1000+ lines)
└── _old/                          # Legacy implementations & experiments
    ├── improved/
    │   ├── index.html
    │   └── app.js
    ├── maritime-ui/
    │   ├── index.html
    │   ├── src/
    │   │   ├── main.jsx
    │   │   ├── App.jsx
    │   │   └── components/
    │   ├── vite.config.js
    │   ├── tailwind.config.js
    │   └── package.json
    ├── maritime-ui-claude/
    │   ├── index.html
    │   ├── src/
    │   │   ├── index.js
    │   │   ├── App.js
    │   │   └── App.test.js
    │   ├── public/
    │   ├── tailwind.config.js
    │   ├── postcss.config.js
    │   └── package.json
    ├── maritime-surveillance-ui-claude/
    │   └── [Complete React application]
    └── simple_uiux/
        └── template/
            └── index.html
```

## 🎯 Core Files

### index.html (Main Interface)
```html
Structure:
├── <head>
│   ├── Meta tags & title
│   ├── Leaflet.js CSS/JS imports
│   └── styles.css import
├── <body>
│   ├── .system-layout (Main grid container)
│   │   ├── .events-sidebar (Left panel)
│   │   ├── .map-section (Center map)
│   │   ├── .details-panel (Right panel)
│   │   └── .mission-section (Bottom timeline)
│   ├── #newEventModal (Create event popup)
│   ├── #actionModal (Action selection popup)
│   └── script.js import
```

### script.js (Core Logic)
```javascript
Structure:
├── Global Variables
│   ├── eventCounter, missionCounter
│   ├── selectedAction, selectedVesselActions
│   ├── currentEventId, creatingEventIds
│   └── eventStorage object
├── Utility Functions
│   ├── generateSeaCoordinateForEvents()
│   ├── generateCoordinatesInRange()
│   └── calculateMonitorTimeRange()
├── Event Management
│   ├── selectEvent()
│   ├── eventStorage methods
│   └── Event details generators
├── Event Creation System
│   ├── Modal management
│   ├── Form validation
│   └── Dynamic event generation
├── Action Systems
│   ├── selectAction() - Modal & vessel buttons
│   ├── toggleActionOption() - Multi-select vessel
│   └── Action execution functions
├── Mission Management
│   ├── createMissionFromAction()
│   └── Timeline updates
└── Map Integration
    ├── Leaflet.js initialization
    ├── Dynamic markers
    └── Popup systems
```

### styles.css (Styling System)
```css
Structure:
├── Global Styles
│   ├── CSS Reset
│   ├── Body & background
│   └── Font definitions
├── Layout System
│   ├── .system-layout (CSS Grid)
│   ├── .events-sidebar
│   ├── .map-section
│   ├── .details-panel
│   └── .mission-section
├── Component Styles
│   ├── Event Cards (.event-card)
│   ├── Forms & Modals
│   ├── Buttons & Actions
│   └── Progress indicators
├── Event Type Specific
│   ├── .type-area, .type-rf, .type-vessel
│   ├── Risk indicators
│   └── Status badges
├── Action Systems
│   ├── .action-btn & .action-btn.selected
│   ├── .type-option & .type-option.selected
│   ├── .action-option & .action-option.selected
│   └── .vessel-action-buttons
├── Map Styles
│   ├── Leaflet customizations
│   ├── Marker styles
│   └── Popup styling
└── Responsive Design
    ├── Mobile breakpoints
    └── Touch optimizations
```

## 🗂️ _old/ Directory (Legacy Code)

### improved/
- **Purpose**: Enhanced version of basic UI
- **Tech**: Vanilla HTML/JS
- **Status**: Superseded by current implementation

### maritime-ui/
- **Purpose**: React + Vite + Tailwind experiment
- **Tech**: React, Vite, Tailwind CSS
- **Files**: JSX components, modern build system
- **Status**: Alternative implementation

### maritime-ui-claude/
- **Purpose**: React + Create React App version
- **Tech**: React, CRA, Tailwind, PostCSS
- **Files**: Standard React app structure
- **Status**: Another React variant

### maritime-surveillance-ui-claude/
- **Purpose**: Full-featured React surveillance app
- **Tech**: React ecosystem with full dependencies
- **Status**: Most complete React implementation

### simple_uiux/
- **Purpose**: Minimal template version
- **Tech**: Basic HTML
- **Status**: Starting template

## 📊 File Statistics

```
Main Implementation:
├── index.html     ~400 lines    # Interface structure
├── script.js      ~2400 lines   # Core functionality  
└── styles.css     ~1100 lines   # Complete styling

Legacy Code:
└── _old/          ~15,000+ lines total
    ├── 5 different approaches
    ├── React variants with npm dependencies
    └── Experimental implementations
```

## 🎨 UI Component Hierarchy

```
System Layout
├── Events Sidebar
│   ├── Sidebar Header
│   │   ├── Title
│   │   └── New Event Button
│   └── Events Container
│       ├── Event Card (AREA-001)
│       ├── Event Card (RF-002)
│       └── Event Card (VESSEL-003)
├── Map Section
│   ├── Interactive Map (Leaflet.js)
│   ├── Zoom Reset Button
│   └── Dynamic Markers
├── Details Panel
│   ├── Details Header
│   ├── Details Content (Dynamic)
│   │   ├── Event Summary
│   │   ├── Evidence/Analysis
│   │   ├── Risk Assessment
│   │   ├── Decision Recommendations
│   │   ├── Action Options
│   │   └── Action Buttons
└── Mission Section
    ├── Mission Header
    └── Mission Timeline
        ├── Mission Card (UAV)
        └── Mission Card (Satellite)
```

## 🔄 Data Flow Architecture

```
User Interaction
├── Event Selection
│   ├── selectEvent() → 
│   ├── eventStorage.getEvent() →
│   └── Dynamic content generation
├── Event Creation
│   ├── Modal forms →
│   ├── Validation →
│   ├── eventStorage.saveEvent() →
│   └── DOM updates
├── Action Selection
│   ├── selectAction() / toggleActionOption() →
│   ├── Visual feedback →
│   └── Button state management
└── Action Execution
    ├── executeAction() / executeVesselActions() →
    ├── Mission creation →
    └── Timeline updates
```

## 🛠️ Technology Stack

### Core Technologies
- **HTML5**: Semantic structure
- **CSS3**: Grid, Flexbox, Custom Properties
- **Vanilla JavaScript**: ES6+, no frameworks
- **Leaflet.js**: Interactive mapping

### Development Approach
- **No Build Process**: Direct browser execution
- **Modular CSS**: Component-based organization  
- **Event-Driven JS**: Clean separation of concerns
- **Responsive Design**: Mobile-first approach

### Browser Requirements
- **ES6+ Support**: Arrow functions, classes, template literals
- **CSS Grid/Flexbox**: Modern layout
- **LocalStorage**: Data persistence
- **Fetch API**: Future AJAX needs