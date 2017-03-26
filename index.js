'use strict';

const https = require('https');
const url = require('url');
const CognitoIdentity = require('aws-sdk/clients/cognitoidentity');
const cognitoidentity = new CognitoIdentity();
const SUCCESS = 'SUCCESS';
const FAILED = 'FAILED';
const UNKNOWN = {
	Error: 'Unknown operation'
};
const validRequestTypes = new Set([
	'Create',
	'Update',
	'Delete'
]);

/**
 * The Lambda function handler
 * See also: https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/crpg-ref.html
 * 
 * @param {!Object} event
 * @param {!string} event.RequestType
 * @param {!string} event.ServiceToken
 * @param {!string} event.ResponseURL
 * @param {!string} event.StackId
 * @param {!string} event.RequestId
 * @param {!string} event.LogicalResourceId
 * @param {!string} event.PhysicalResourceId
 * @param {!Object} event.ResourceProperties
 * @param {!Object} event.ResourceProperties.Options
 * @param {!Object} context
 * @param {!Requester~requestCallback} callback
 */
exports.handler = (event, context, callback) => {
	console.log(event, context);

	const {
		StackId,
		RequestId,
		LogicalResourceId,
		PhysicalResourceId,
		RequestType,
		ResponseURL,
		ResourceProperties
	} = event;

	const {logStreamName} = context;
	
	function respond(Status, Data, PhysicalResourceId=logStreamName) {
		const responseBody = JSON.stringify({
			Status,
			Reason: `See the details in CloudWatch Log Stream: ${logStreamName}`,
			PhysicalResourceId,
			StackId,
			RequestId,
			LogicalResourceId,
			Data
		});
		
		console.log('Response body:\n', responseBody);
		
		const {hostname, path} = url.parse(ResponseURL);
		const options = {
			hostname,
			port: 443,
			path,
			method: 'PUT',
			headers: {
				'content-type': '',
				'content-length': responseBody.length
			}
		};
		
		return new Promise((resolve, reject) => {
				const request = https
					.request(options, resolve);
			
				request.on('error', error => reject(`send(..) failed executing https.request(..): ${error}`));
				request.write(responseBody);
				request.end();
			})
			.then(() => callback(Status === FAILED ? Status : null, Data))
			.catch(callback);
	}
	
	if (!validRequestTypes.has(RequestType))
		return respond(FAILED, UNKNOWN);

	const params = RequestType === 'Delete' ? {} : Object.assign({}, ResourceProperties.Options);
	
	switch (LogicalResourceId) {
		case 'CognitoIdentityPool':
			if (RequestType !== 'Create')
				params.IdentityPoolId = PhysicalResourceId;
			
			// CloudFormation passes the value as a string, so it must be converted to a valid javascript object
			if (RequestType !== 'Delete') {
				const parseParams = [
					'AllowUnauthenticatedIdentities',
					'CognitoIdentityProviders',
					'OpenIdConnectProviderARNs',
					'SamlProviderARNs',
					'SupportedLoginProviders'
				];
				
				try {
					for (let param of parseParams) {
						if (params[param])
							params[param] = JSON.parse(params[param]);
					}
				} catch (message) {
					return respond(FAILED, {message});
				}
			}
			
			return cognitoidentity[`${RequestType.toLowerCase()}IdentityPool`](params)
				.promise()
				.then(data => respond(SUCCESS, data, data.IdentityPoolId))
				.catch(message => respond(FAILED, {message}));
		case 'CognitoIdentityPoolRoles':
			switch (RequestType) {
				case 'Create':
				case 'Update':
					return cognitoidentity
						.setIdentityPoolRoles(params)
						.promise()
						.then(data => respond(SUCCESS, data))
						.catch(message => respond(FAILED, {message}));
				case 'Delete':
					return respond(SUCCESS);
			}
			break;
		default:
			return respond(FAILED, UNKNOWN);
	}
};