# Datasets
## Danish Water
```
data:
   data/Labelled Data
   data/Unlabelled Data
projects:
   openProjects/danishWater
   openProjects/linRex
code:
   utils/
   bigru...
```
- 學長的專案用的資料集

## MarineTraffic
- Data API
   - [Vessel Positions in an Area of Interest](https://servicedocs.marinetraffic.com/tag/AIS-API#operation/exportvessels-custom-area_)
   - Run every minutes (max request 2 minute once)
   - 

## AISStream
```
data:
   ais/
projects:
   openProjects/example
```
### Data Format
- Message
- MessageType
- MetaData
```json
{
   "Message":{
      "PositionReport":{
         "Cog":308,
         "CommunicationState":81982,
         "Latitude":66.02695,
         "Longitude":12.253821666666665,
         "MessageID":1,
         "NavigationalStatus":15,
         "PositionAccuracy":true,
         "Raim":false,
         "RateOfTurn":4,
         "RepeatIndicator":0,
         "Sog":0,
         "Spare":0,
         "SpecialManoeuvreIndicator":0,
         "Timestamp":31,
         "TrueHeading":235,
         "UserID":259000420,
         "Valid":true
      }
   },
   "MessageType":"PositionReport",
   "MetaData":{
      "MMSI":259000420,
      "ShipName":"AUGUSTSON",
      "latitude":66.02695,
      "longitude":12.253821666666665,
      "time_utc":"2022-12-29 18:22:32.318353 +0000 UTC"
   },
   "received_at": "2022-12-29 18:22:32.318353 +0000 UTC"
}
```