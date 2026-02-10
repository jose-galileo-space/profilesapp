# Galielo Space

## Get Started

### Background
This repo holds the web application for galileo-space.com

profilesapp was the name given to the initial directory created and we're keeping that for now.

## Installation 
```
brew install git
brew install awscli
brew install aws-amplify
brew install npm
brew install nvm
brew install aws-cdk
```

## Git clone
```
git clone https://github.com/jose-galileo-space/profilesapp.git
```

## Configure aws profile
```
aws configure sso
```
Use whatever you want for name
Use `https://d-9167050abd.awsapps.com/start` as your sso url
Use `us-west-1` as you region
Use default for scope (aka press enter when prompted for that)

To run on locally please use:

```
cd profilesapp
cd galileo-website
npm install
npm run dev
```