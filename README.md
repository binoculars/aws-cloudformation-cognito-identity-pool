# AWS CloudFormation Cognito Identity Pool
> An [AWS Lambda-backed Custom Resource](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/template-custom-resources-lambda.html) for CRUD operations on Cognito Identity Pools

[![Codacy Badge](https://api.codacy.com/project/badge/Grade/5149b6ed184b4775b3d0ef04c6a4e27f)](https://www.codacy.com/app/barrett-harber/aws-cloudformation-cognito-identity-pool?utm_source=github.com&amp;utm_medium=referral&amp;utm_content=binoculars/aws-cloudformation-cognito-identity-pool&amp;utm_campaign=Badge_Grade)

### Background
Cognito Identity Pools are not currently supported within CloudFormation templates. However, CloudFormation provides extensibility via Custom Resources, which enable Create/Update/Delete operations. This is meant to replace having to manually create Cognito Identity Pools manually via the CLI or web console.

> See the related [blog post](https://medium.com/@barrettharber/polyfilling-aws-cloudformation-with-a-lambda-backed-custom-resource-a907f65144d5#.fnl9giwg1) for more information.

### Quick Start
1. Ensure you have node.js >= 4 installed (preferably via nvm)
1. Install gulp globally (`npm i -g gulp`)
1. Clone this repository
1. Run `npm install`
1. Create an S3 bucket to hold your Lambda Function (skip this if you already have one)
1. Create `config.json` (see below)
1. Ensure you have the [AWS SDK for Node.js configured](https://docs.aws.amazon.com/AWSJavaScriptSDK/guide/node-configuring.html) correctly. Also, set the `AWS_REGION` environment variable.
1. Run `gulp` this will:
  1. Build the Lambda function and place it in dist.zip
  1. Upload the function to S3
  1. Create the CloudFormation Stack
1. Create your IAM Role Policy(ies). Examples are provided in [cloudformation-role-policies-example.json](cloudformation-role-policies-example.json), which provides managed policies that are attached to the IAM roles. This is necessary for your users to be able to use their credentials to do anything.

### Example `config.json`
Create a `config.json` file. See [The AWS-SDK for JavaScript docs on CognitoIdentity](https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/CognitoIdentity.html#createIdentityPool-property) for options, or run `aws cloudformation get-template-summary --template-body file:///path/to/cloudformation.json`

```JSON
{
	"IdentityPoolName": "IdentityPoolName",
	"AllowUnauthenticatedIdentities": false,
	"LambdaS3Bucket": "bucket-name",
	"LambdaS3Key": "CloudFormation-CustomResource-CognitoIdentityPool.zip",
	"DeveloperProviderName": "com.site"
}
```

All non-string values will be stringified for the CloudFormation template. If you're going to use the template directly (instead of using gulp), keep this in mind.

### Testing
1. Configure your environment
  - Run npm install (`npm i`)
  - Create your Lambda S3 Bucket
  - Configure the AWS SDK for Node.js (or just set the `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and `AWS_REGION` environment variables)
  - Create your `config.json`
1. Run `npm test`