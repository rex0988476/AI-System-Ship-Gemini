git clone https://github.com/4180uilmot/AI-System-Ship-Backend.git


git clone -b dev-J \
 --single-branch https://github.com/4180uilmot/AI-System-Ship-Backend.git
cd AI-System-Ship-Backend/trajectoryPrediction

# uv
url -LsSf https://astral.sh/uv/install.sh | sh

uv run marineTraffic/preprocess.py
uv run train.py
uv run test.py

# Example of system predicting a trajectory 
uv run predict_traj.py