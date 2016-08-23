'use strict';

const config = require('./config.json');
const packageInfo = require('./package.json');
const lambda = require('./index.js');
const assert = require('assert');
const AWS = require('aws-sdk');
const s3 = new AWS.S3();

const today = new Date();
const date = [
	today.getUTCFullYear(),
	today.getUTCMonth() + 1,
	today.getUTCDate()
].join('/');
const StackId = `arn:aws:cloudformation:${process.env.AWS_REGION}:000000000000:stack/${packageInfo.name}/00000000-0000-0000-0000-000000000000`;
const RequestId = 'TEST_REQUEST_ID';
const IdentityPoolName = 'test_id_pool';
const context = {
	logStreamName: `${date}/[$LATEST]aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`
};

let ResponseURL;

beforeEach(cb => {
	s3.getSignedUrl(
		'putObject',
		{
			Bucket: config.LambdaS3Bucket,
			Key: `test/${packageInfo.name}.json`
		},
		(error, url) => {
			ResponseURL = url;
			cb();
		}
	);
});

/**
 * Note: This suite must run in order
 */
describe('Cognito Identity Pool', () => {
	const LogicalResourceId = 'CognitoIdentityPool';
	const ResourceProperties = {
		Options: {
			IdentityPoolName,
			AllowUnauthenticatedIdentities: 'false',
			DeveloperProviderName: 'TEST_PROVIDER_NAME'
		}
	};
	let IdentityPoolId;
	
	describe('Create', () => {
		it('should create a Cognito Identity Pool', cb => {
			lambda.handler(
				// event
				{
					ResponseURL,
					StackId,
					RequestId,
					LogicalResourceId,
					RequestType: 'Create',
					ResourceProperties
				},
				// context
				context,
				// callback
				(error, data) => {
					assert.ifError(error);
					assert.ok(data.IdentityPoolId);
					assert.strictEqual(data.IdentityPoolName, IdentityPoolName);
					assert.strictEqual(data.AllowUnauthenticatedIdentities, ResourceProperties.Options.DeveloperProviderName === 'true');
					assert.strictEqual(data.DeveloperProviderName, ResourceProperties.Options.DeveloperProviderName);
					IdentityPoolId = data.IdentityPoolId;
					cb();
				}
			);
		});
	});
	
	describe('Update', () => {
		it('should update a Cognito Identity Pool', cb => {
			lambda.handler(
				// event
				{
					ResponseURL,
					StackId,
					RequestId,
					LogicalResourceId,
					PhysicalResourceId: IdentityPoolId,
					RequestType: 'Update',
					ResourceProperties
				},
				// context
				context,
				// callback
				(error, data) => {
					assert.ifError(error);
					assert.ok(data.IdentityPoolId);
					assert.strictEqual(data.IdentityPoolName, IdentityPoolName);
					assert.strictEqual(data.AllowUnauthenticatedIdentities, ResourceProperties.Options.DeveloperProviderName === 'true');
					assert.strictEqual(data.DeveloperProviderName, ResourceProperties.Options.DeveloperProviderName);
					cb();
				}
			);
		});
	});
	
	describe('Delete', () => {
		it('should delete a Cognito Identity Pool', cb => {
			lambda.handler(
				// event
				{
					ResponseURL,
					StackId,
					RequestId,
					LogicalResourceId,
					PhysicalResourceId: IdentityPoolId,
					RequestType: 'Delete',
					ResourceProperties
				},
				// context
				context,
				// callback
				(error, data) => {
					assert.ifError(error);
					cb();
				}
			);
		});
	});
	
	describe('Unknown', () => {
		it('should fail', cb => {
			lambda.handler(
				// event
				{
					ResponseURL,
					StackId,
					RequestId,
					LogicalResourceId,
					PhysicalResourceId: IdentityPoolId,
					RequestType: 'UNKNOWN',
					ResourceProperties
				},
				// context
				context,
				// callback
				(error, data) => {
					assert.ifError(!error);
					cb();
				}
			);
		});
	});
});

describe('Cognito Identity Pool Roles', () => {
	const cognitoidentity = new AWS.CognitoIdentity();
	const iam = new AWS.IAM();
	const LogicalResourceId = 'CognitoIdentityPoolRoles';
	const ResourceProperties = {
		Options: {
			Roles: {
				authenticated: ''
			}
		}
	};
	const RoleName = 'TEST_ROLE';
	let IdentityPoolId;
	
	before(() => Promise
		.all([
			cognitoidentity
				.createIdentityPool({
					IdentityPoolName,
					AllowUnauthenticatedIdentities: false,
					DeveloperProviderName: 'devauth'
				})
				.promise()
				.then(data => IdentityPoolId = ResourceProperties.Options.IdentityPoolId = data.IdentityPoolId),
			iam
				.createRole({
					AssumeRolePolicyDocument: JSON.stringify({
						'Version': '2012-10-17',
						'Statement': [
							{
								'Effect': 'Allow',
								'Principal': {
									'Federated': 'cognito-identity.amazonaws.com'
								},
								'Action': 'sts:AssumeRoleWithWebIdentity',
								'Condition': {
									'StringEquals': {
										'cognito-identity.amazonaws.com:aud': ''
									},
									'ForAnyValue:StringLike': {
										'cognito-identity.amazonaws.com:amr': 'authenticated'
									}
								}
							}
						]
					}),
					RoleName
				})
				.promise()
				.then(data => ResourceProperties.Options.Roles.authenticated = data.Arn)
		])
	);
	
	describe('Create', () => {
		it('should update a Cognito Identity Pool with Roles', cb => {
			lambda.handler(
				// event
				{
					ResponseURL,
					StackId,
					RequestId,
					LogicalResourceId,
					RequestType: 'Create',
					ResourceProperties
				},
				// context
				context,
				// callback
				(error, data) => {
					assert.ifError(error);
					cb();
				}
			);
		});
	});
	
	describe('Update', () => {
		it('should update a Cognito Identity Pool with Roles', cb => {
			lambda.handler(
				// event
				{
					ResponseURL,
					StackId,
					RequestId,
					LogicalResourceId,
					RequestType: 'Update',
					ResourceProperties
				},
				// context
				context,
				// callback
				(error, data) => {
					assert.ifError(error);
					cb();
				}
			);
		});
	});
	
	describe('Delete', () => {
		it('should do nothing and respond with success', cb => {
			lambda.handler(
				// event
				{
					ResponseURL,
					StackId,
					RequestId,
					LogicalResourceId,
					RequestType: 'Delete',
					ResourceProperties
				},
				// context
				context,
				// callback
				(error, data) => {
					assert.ifError(error);
					cb();
				}
			);
		});
	});
	
	describe('Unknown', () => {
		it('should fail', cb => {
			lambda.handler(
				// event
				{
					ResponseURL,
					StackId,
					RequestId,
					LogicalResourceId,
					PhysicalResourceId: IdentityPoolId,
					RequestType: 'UNKNOWN',
					ResourceProperties
				},
				// context
				context,
				// callback
				(error, data) => {
					assert.ifError(!error);
					cb();
				}
			);
		});
	});
	
	after(() => Promise
		.all([
			cognitoidentity
				.deleteIdentityPool({
					IdentityPoolId
				})
				.promise(),
			iam
				.deleteRole({
					RoleName
				})
				.promise()
		])
	);
});