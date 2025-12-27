# Use AWS Lambda Python base image
FROM public.ecr.aws/lambda/python:3.11

# 1. Install System Dependencies
# FIX: Added 'gcc-c++' because contourpy requires a C++ compiler
RUN yum install -y mesa-libGL glib2 gcc gcc-c++ python3-devel

# 2. Upgrade pip
RUN pip install --upgrade pip

# 3. Install Headless OpenCV first
RUN pip install opencv-python-headless

# 4. Install the main libraries
RUN pip install ultralytics boto3 pillow --no-cache-dir

# 5. Copy files
COPY main.py ${LAMBDA_TASK_ROOT}
COPY yolov8n-obb.pt ${LAMBDA_TASK_ROOT}

CMD [ "main.handler" ]