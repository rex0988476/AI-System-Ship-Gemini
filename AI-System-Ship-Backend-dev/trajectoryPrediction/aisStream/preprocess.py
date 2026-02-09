"""
# About this file: 
#   Used to test MongoDB connection and data retrieval
# Data fields:
    Seq data fields:
        Longtitude: 經度，單位為度，東經為正，西經為負
        Latitude: 緯度，單位為度，北緯為正，南緯為負
        COG (Course Over Ground): 對地航向，0-360 度，實際航跡方向
        SOG (Speed Over Ground): 對地速度，單位通常為節
        RateOfTurn: 轉向率（deg/min），正=右轉、負=左轉，-128 通常代表不可用
        TrueHeading: 真航向（0-359 度），511 代表不可用
    Time data fields:
        "time_utc": "2026-02-04 07:31:14.602299654 +0000 UTC",
    Status data fields:
        UserID: 船舶識別號（MMSI）
        NavigationalStatus: 航行狀態碼（0-15），例如 0=航行中、1=錨泊、5=系泊、8=帆航、15=未定義
        PositionAccuracy: 位置精度旗標，True=高精度（通常 <=10m），False=低精度
        "ShipName": "TB SEMAR 82         "
        SpecialManoeuvreIndicator: 特殊操縱指示（0=無，1=轉向中，2=危險操縱）
        RepeatIndicator: AIS 重複傳送標記（0=不重複，1-3=重播次數）
    ---
    Not use data fields:
        CommunicationState: AIS 通訊時隙/同步狀態欄位，通常不作為特徵欄位使用
        MessageID: AIS 訊息類型編號（例如 1/2/3 為位置報告），通常不作為特徵欄位使用
        RAIM: GPS 完整性監測旗標，True=啟用，False=未啟用
        Spare: 保留欄位（通常為 0），無實際意義
        Valid: 資料有效性旗標（通常由解析流程判定）
        Timestamp: AIS 欄位，表示該分鐘內的秒數（0-59）
    Example data:
{
    "Cog": 203.1,
    "CommunicationState": 82140,
    "Latitude": -7.198728333333333,
    "Longitude": 112.73085999999999,
    "MessageID": 1,
    "NavigationalStatus": 15,
    "PositionAccuracy": true,
    "Raim": false,
    "RateOfTurn": -128,
    "RepeatIndicator": 0,
    "Sog": 0,
    "Spare": 0,
    "SpecialManoeuvreIndicator": 0,
    "Timestamp": 15,
    "TrueHeading": 511,
    "UserID": 525021186,
    "Valid": true,
    "time_utc": "2026-02-04 07:31:14.602299654 +0000 UTC",
    "ShipName": "TB SEMAR 82         "
}
"""
from pymongo import MongoClient

import json
from tqdm import tqdm

MONGO_URL = "mongodb+srv://dbUser:dbUserPwd@gcp.mrvbbti.mongodb.net/appName=GCP"
client = MongoClient(MONGO_URL)
db = client["general_test"]
col = db["aisStreamPositionReport"]
length = col.count_documents({})

trajectories = {}
# Keep-list of fields based on the comment blocks above
KEEP_DATA_FIELDS = {
    "Latitude",
    "Longitude",
    "Cog",
    "Sog",
    "RateOfTurn",
    "TrueHeading",
    "NavigationalStatus",
    "PositionAccuracy",
    "SpecialManoeuvreIndicator",
    "RepeatIndicator",
    "UserID",
    "time_utc",
    "ShipName",
}

for doc in tqdm(col.find(), total=length):
    trajectory = []
    
    mmsi = doc.get('meta_data').get('MMSI')
    data = doc.get('data') or {}
    data = {k: v for k, v in data.items() if k in KEEP_DATA_FIELDS}
    meta = doc.get('meta_data') or {}
    data['time_utc'] = meta.get('time_utc') if 'time_utc' in KEEP_DATA_FIELDS else None
    data['ShipName'] = meta.get('ShipName') if 'ShipName' in KEEP_DATA_FIELDS else None
    data = {k: v for k, v in data.items() if k in KEEP_DATA_FIELDS}  
    if mmsi not in trajectories:
        trajectories[mmsi] = [data]
        continue
    trajectories[mmsi].append(data)
    # print(json.dumps(data, indent=4))

    """
    for key, value in data.items():
        print(f"{key}: {value} | type: {type(value)}")
    """
print(f"Total unique MMSI: {len(trajectories)}")
