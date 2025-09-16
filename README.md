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

## Configure aws amplify
```
amplify configure
```

For the list below, you have to go into the aws account and
find the IAM User named amplify-dev. Don't create a new User, but kinda follow this
https://docs.amplify.aws/gen1/react/tools/cli/start/set-up-cli/

1. speficy region
2. specify access key from amplify-dev
3. specify secret access from amplify-dev



To run on locally please use:

```
cd profilesapp
npm install
npm run dev
```