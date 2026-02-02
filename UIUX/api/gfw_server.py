#!/usr/bin/env python3
"""
GFW API 伺服器 - Flask 後端
提供船舶資料查詢 API
"""

from flask import Flask, jsonify, request
from flask_cors import CORS
import requests
import sys
import os

# 引入 gfw_simple 的 API Token
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'data'))
from gfw_simple import API_TOKEN

app = Flask(__name__)
CORS(app)  # 允許跨域請求

# GFW API 設定
GFW_BASE_URL = "https://gateway.api.globalfishingwatch.org/v3"


def search_gfw_vessel(mmsi):
    """
    呼叫 GFW API 搜尋船隻
    """
    url = f"{GFW_BASE_URL}/vessels/search"
    headers = {"Authorization": f"Bearer {API_TOKEN}"}
    params = {
        "query": mmsi,
        "datasets[0]": "public-global-vessel-identity:latest"
    }

    try:
        response = requests.get(url, headers=headers, params=params, timeout=10)
        response.raise_for_status()
        return response.json()
    except requests.RequestException as e:
        print(f"❌ GFW API 錯誤: {e}")
        return None


def convert_gfw_to_vessel_format(gfw_data, mmsi):
    """
    將 GFW 格式轉換為 VesselDatabase 格式
    """
    if not gfw_data or not gfw_data.get('entries'):
        return None

    vessel = gfw_data['entries'][0]

    # 提取基本資訊
    self_reported = vessel.get('selfReportedInfo', [{}])[0]
    combined_info = vessel.get('combinedSourcesInfo', [{}])[0]

    # 提取船舶類型
    ship_types = combined_info.get('shiptypes', [])
    vessel_type = ship_types[0]['name'] if ship_types else 'UNKNOWN'

    # 提取國籍
    country = self_reported.get('flag', 'UNKNOWN')

    # 提取船名
    ship_name = self_reported.get('shipname') or f'VESSEL-{mmsi}'

    # 提取規格
    length = self_reported.get('length', 0)
    width = self_reported.get('width', 0)
    tonnage = vessel.get('tonnage', 0)

    # 構建標準格式
    converted = {
        'mmsi': mmsi,
        'name': ship_name,
        'type': vessel_type,
        'country': country,
        'position': {
            'lat': 0,  # GFW search API 不提供實時位置
            'lon': 0,
            'speed': 0,
            'course': 0
        },
        'specifications': {
            'length': length or 0,
            'width': width or 0,
            'tonnage': tonnage or 0
        }
    }

    return converted


@app.route('/api/vessel/<mmsi>', methods=['GET'])
def get_vessel(mmsi):
    """
    查詢單一船舶資料
    GET /api/vessel/{mmsi}
    """
    print(f"🔍 查詢船舶: {mmsi}")

    # 1. 呼叫 GFW API
    gfw_data = search_gfw_vessel(mmsi)

    if not gfw_data:
        return jsonify({
            'error': 'GFW API 呼叫失敗',
            'mmsi': mmsi
        }), 500

    # 2. 轉換格式
    converted = convert_gfw_to_vessel_format(gfw_data, mmsi)

    if not converted:
        return jsonify({
            'error': '無船舶資料',
            'mmsi': mmsi
        }), 404

    print(f"✅ 成功取得船舶: {converted['name']} ({mmsi})")
    return jsonify(converted)


@app.route('/api/vessels', methods=['GET'])
def get_vessels():
    """
    批次查詢船舶資料
    GET /api/vessels?mmsi=xxx,yyy,zzz
    """
    mmsi_list = request.args.get('mmsi', '').split(',')
    mmsi_list = [m.strip() for m in mmsi_list if m.strip()]

    if not mmsi_list:
        return jsonify({'error': '請提供 MMSI 參數'}), 400

    results = []
    for mmsi in mmsi_list:
        gfw_data = search_gfw_vessel(mmsi)
        if gfw_data:
            converted = convert_gfw_to_vessel_format(gfw_data, mmsi)
            if converted:
                results.append(converted)

    return jsonify({
        'total': len(results),
        'vessels': results
    })


@app.route('/api/health', methods=['GET'])
def health_check():
    """
    健康檢查
    """
    return jsonify({
        'status': 'ok',
        'service': 'GFW API Server',
        'version': '1.0.0'
    })


@app.route('/', methods=['GET'])
def index():
    """
    API 首頁
    """
    return jsonify({
        'service': 'GFW API Server',
        'endpoints': {
            'vessel': '/api/vessel/<mmsi>',
            'vessels': '/api/vessels?mmsi=xxx,yyy',
            'health': '/api/health'
        }
    })


if __name__ == '__main__':
    print("🚀 啟動 GFW API 伺服器...")
    print("📍 http://localhost:5000")
    print("=" * 50)
    app.run(host='0.0.0.0', port=5000, debug=True)
