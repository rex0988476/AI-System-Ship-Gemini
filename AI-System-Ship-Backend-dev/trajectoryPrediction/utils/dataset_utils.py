import pandas as pd
import numpy as np
import pickle
import torch
import torch.nn.functional as F
from tqdm import tqdm
from torch.nn.utils.rnn import pad_sequence

# Collate function for variable-length AIS sequences
def collate_ais(batch):
    mmsi, ts, label, length, inputs, targets = zip(*batch)
    inputs = pad_sequence(inputs, batch_first=True)   # [B, T, 4]
    targets = pad_sequence(targets, batch_first=True) # [B, T, 4]
    return (
        torch.stack(mmsi),
        list(ts),
        torch.stack(label),
        torch.stack(length),
        inputs,
        targets,
    )

# Split a trajectory into sliding windows (seq_len -> next)
def split_trajectory_windows(inputs, targets, seq_len=5, stride=1):
    windows = []
    total = inputs.size(0)
    end = total - seq_len
    if end <= 0:
        return windows
    for start in range(0, end, stride):
        x = inputs[start:start + seq_len]
        y = targets[start + seq_len]
        windows.append((x, y))
    return windows

def convertShipTypeToName(shipType):
    
    choices = {
        '20': 'Wing in Ground',
        '21': 'Wing in Ground',
        '22': 'Wing in Ground',
        '23': 'Wing in Ground',
        '24': 'Wing in Ground',
        '25': 'Wing in Ground',
        '26': 'Wing in Ground',
        '27': 'Wing in Ground',
        '28': 'Wing in Ground',
        '29': 'SAR Aircraft',
        '30': 'Fishing',
        '31': 'Tug',
        '32': 'Tug',
        '33': 'Dredger',
        '34': 'Dive Vessel',
        '35': 'Military',
        '36': 'Sailing',
        '37': 'Pleasure',
        '40': 'High Speed Vessel',
        '41': 'High Speed Vessel',
        '42': 'High Speed Vessel',
        '43': 'High Speed Vessel',
        '44': 'High Speed Vessel',
        '45': 'High Speed Vessel',
        '46': 'High Speed Vessel',
        '47': 'High Speed Vessel',
        '48': 'High Speed Vessel',
        '49': 'High Speed Vessel',
        '50': 'Pilot',
        '51': 'SAR Ship',
        '52': 'Tug',
        '53': 'Port Tender',
        '54': 'Anti-Pollution',
        '55': 'Law Enforcement',
        '56': 'Local Vessel',  #Local Vessel
        '57': 'Local Vessel',
        '58': 'Medical Transfer',
        '59': 'Special Craft', #eg construction at windmills
        '60': 'Passenger',
        '61': 'Passenger',
        '62': 'Passenger',
        '63': 'Passenger',
        '64': 'Passenger',
        '65': 'Passenger',
        '66': 'Passenger',
        '67': 'Passenger',
        '68': 'Passenger',
        '69': 'Passenger',
        '70': 'Cargo',
        '71': 'Cargo',
        '72': 'Cargo',
        '73': 'Cargo',
        '74': 'Cargo',
        '75': 'Cargo',
        '76': 'Cargo',
        '77': 'Cargo',
        '78': 'Cargo',
        '79': 'Cargo',
        '80': 'Tanker',
        '81': 'Tanker',
        '82': 'Tanker',
        '83': 'Tanker',
        '84': 'Tanker',
        '85': 'Tanker',
        '86': 'Tanker',
        '87': 'Tanker',
        '88': 'Tanker',
        '89': 'Tanker',
        '90': 'Other',
        '91': 'Other',
        '92': 'Other',
        '93': 'Other',
        '94': 'Other',
        '95': 'Other',
        '96': 'Other',
        '97': 'Other',
        '98': 'Other',
        '99': 'Other'
    }
    
    return choices.get(str(shipType), np.nan)

def classNames():
    names = [
        'Cargo',
        'Tanker',
        'Fishing',
        'Passenger',
        'Sailing',
        'Pleasure',
        'High Speed Vessel',
        'Military',
        'Law Enforcement',
        'Pilot',
        'Tug',
        'Dredger',
        'Dive Vessel',
        'Port Tender',
        'Anti-Pollution',
        'Medical Transfer',
        'Local Vessel',
        'Special Craft',
        'SAR Ship',
        'SAR Aircraft',
        'Wing in Ground',
        'Other'
    ]
    
    return np.array(names), len(names)

def readTrajectory(filename, idx):

    with open(filename, 'rb') as file:
        dataSetParams = pickle.load(file)

    index = dataSetParams['indicies'][idx]

    with open(dataSetParams['dataFileName'], 'rb') as file:
        file.seek(index)
        track = pickle.load(file)

    return pd.DataFrame(track)

def readDataset(filename):

    #make dataset
    with open(filename, "rb") as f:
        params = pickle.load(f)
    print("Loaded dataset parameters.")
    
    datapath = params['dataFileName']
    indicies = params['indicies']
    N = len(indicies)
    print(f"Total number of trajectories: {N}")

    data = []
    mmsis = []
    shiptypes = []
    lengths = []
    for i, index in tqdm(enumerate(indicies)):
        
        with open(datapath, 'rb') as file:
            file.seek(index)
            track = pickle.load(file)
            
        tmpdf = pd.DataFrame(track)
        tmpdf['course'] = tmpdf['course'].fillna(value=0)
        
        data_tmp = np.array(tmpdf[['lat','lon','speed','course']].values)
        
        data.append(data_tmp)
        mmsis.append(track['mmsi'])
        shiptypes.append(track['shiptype'])
        lengths.append(track['track_length'])
        
    return data, params, np.array(mmsis), np.array(shiptypes), np.array(lengths)
        
class AISDataset(torch.utils.data.Dataset):
    def __init__(self, infoPath, combined=False, train_preproc = None, seq_len=None, stride=1):
        self.Infopath = infoPath
        self.classnames, self.Nclasses = classNames()
        self.train_preproc = train_preproc
        self.seq_len = seq_len
        self.stride = stride

        with open(self.Infopath, "rb") as f:
            self.params = pickle.load(f)
        
        print(self.params.keys())
        print(self.params['mean'])
        
        if combined:
            self.indicies = self.params['indicies']
            if self.train_preproc is None:
                self.mean = self.params['mean']
                self.std = self.params['std']
            else:
                self.mean, self.std = self.train_preproc
        elif self.train_preproc is None:
            self.indicies = self.params['trainIndicies']
            self.mean = self.params['train_mean']
            self.std = self.params['train_std']
        else:
            self.indicies = self.params['testIndicies']
            self.mean, self.std = self.train_preproc
        
        self.datapath = self.params['dataFileName']        
        self.datasetN = len(self.indicies)
        print(f"Dataset initialized with path {self.datapath}.")
                     
        self.labels, self.lengths, self.mmsis = self.getLabels()
        self.pad_len = self.params['maxTrackLength']
        print(self.labels.shape, self.lengths.shape, self.mmsis.shape)

        # Build sliding-window index if seq_len is provided
        self.window_index = None
        if self.seq_len is not None:
            self.window_index = []
            for idx, length in enumerate(self.lengths.tolist()):
                # Need at least seq_len + 1 to predict next step
                max_start = length - self.seq_len - 1
                if max_start < 0:
                    continue
                for start in range(0, max_start + 1, self.stride):
                    self.window_index.append((idx, start))
            self.datasetN = len(self.window_index)
        
        if 'outlierLabels' in self.params.keys():
            self.outliers = self.params['outlierLabels']
                    
    def __len__(self):
        return self.datasetN

    def __getitem__(self, idx):
            
        # Map global index to (track index, window start) if using sliding windows
        if self.window_index is not None:
            track_idx, start = self.window_index[idx]
            index = self.indicies[track_idx]
        else:
            index = self.indicies[idx]
        
        with open(self.datapath, 'rb') as file:
            file.seek(index)
            track = pickle.load(file)
        
        typeName = convertShipTypeToName(str(track['shiptype']))
        label = np.where(typeName==self.classnames)[0][0] if typeName is not np.nan else -1
        length = track['track_length']
        
        tmpdf = pd.DataFrame(track)
        tmpdf['course'] = tmpdf['course'].fillna(value=0)    
        targets = torch.tensor(tmpdf[['lat','lon','speed','course']].values, dtype=torch.float)
        inputs = targets # (targets - self.mean)/self.std
        
        timestamps = torch.tensor(track['timestamp'], dtype=torch.long)
        mmsi = torch.tensor(track['mmsi'], dtype=torch.long)
        label = torch.tensor(label, dtype=torch.long)
        length = torch.tensor(length, dtype=torch.long)

        # Optional padding/cropping to fixed length (disabled when using seq_len windows)
        if self.pad_len is not None and self.seq_len is None:
            if inputs.size(0) > self.pad_len:
                inputs = inputs[-self.pad_len:]
                targets = targets[-self.pad_len:]
                timestamps = timestamps[-self.pad_len:]
            elif inputs.size(0) < self.pad_len:
                pad_size = self.pad_len - inputs.size(0)
                inputs = F.pad(inputs, (0, 0, 0, pad_size))
                targets = F.pad(targets, (0, 0, 0, pad_size))
                timestamps = F.pad(timestamps, (pad_size, 0), mode='constant', value=0)

        # Build fixed-length sequence + next-step target
        if self.seq_len is not None:
            if self.window_index is not None:
                inputs = inputs[start:start + self.seq_len]
                targets = targets[start + self.seq_len]
                timestamps = timestamps[start:start + self.seq_len]
            else:
                if inputs.size(0) < self.seq_len + 1:
                    pad_size = self.seq_len + 1 - inputs.size(0)
                    inputs = F.pad(inputs, (0, 0, 0, pad_size))
                    targets = F.pad(targets, (0, 0, 0, pad_size))
                    timestamps = F.pad(timestamps, (pad_size, 0), mode='constant', value=0)
                inputs = inputs[:self.seq_len]
                targets = targets[self.seq_len]
                timestamps = timestamps[:self.seq_len]
        
        return  mmsi, timestamps, label, length, inputs, targets
    
    
    
    def getLabels(self):
        
        labels = []
        lengths = []
        mmsis = []
        with torch.no_grad():
            for index in self.indicies:
                with open(self.datapath,'rb') as file:
                    file.seek(index)
                    track = pickle.load(file)
                    typeName = convertShipTypeToName(str(track['shiptype']))
                    
                    if typeName is not np.nan:
                        labels.append(np.where(typeName==self.classnames)[0][0])
                    else:
                        labels.append(-1)
                    
                    mmsis.append(track['mmsi'])
                    lengths.append(track['track_length'])
                            
        return torch.tensor(labels), torch.tensor(lengths), torch.tensor(mmsis)
        
    def getDataObservation(self, idx):
            
        index = self.indicies[idx]
        
        with open(self.datapath, 'rb') as file:
            file.seek(index)
            track = pickle.load(file)
            
        return pd.DataFrame(track)

    def reconstruct(self, encodedTrack):
        recon = encodedTrack * self.std + self.mean
            
        return recon
