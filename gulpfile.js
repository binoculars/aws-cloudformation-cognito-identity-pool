'use strict';

const fs = require('fs');
const path = require('path');
const util = require('util');
const gulp = require('gulp');
const del = require('del');
const install = require('gulp-install');
const zip = require('gulp-zip');
const runSequence = require('run-sequence');
const AWS = require('aws-sdk');
const s3 = new AWS.S3();
const cloudFormation = new AWS.CloudFormation();
const lambda = new AWS.Lambda();

let config;
try {
	config = require('./config.json');
} catch (ex) {
	console.error('Cannot load configuration');
	config = {};
}

const StackName = 'cognito-identity-pool';

gulp.task('clean', () => del([
	'./build/*',
	'./dist/*',
	'./dist.zip'
]));

gulp.task('js', () => gulp
	.src([
		'index.js'
	])
	.pipe(gulp.dest('./dist'))
);

gulp.task('npm', () => gulp
	.src('./package.json')
	.pipe(gulp.dest('./dist'))
	.pipe(install({production: true}))
);

gulp.task('zip', () => gulp
	.src([
		'dist/**/*',
		'!dist/package.json',
		'dist/.*'
	])
	.pipe(zip('dist.zip'))
	.pipe(gulp.dest('./'))
);

const {
	LambdaS3Bucket,
	LambdaS3Key
} = process.env;

gulp.task('upload', () => s3
	.putObject({
		Bucket: LambdaS3Bucket,
		Key: LambdaS3Key,
		Body: fs.createReadStream('./dist.zip')
	})
	.promise()
);

gulp.task('listStacks', () => cloudFormation
	.listStacks({
		StackStatusFilter: [
			'CREATE_COMPLETE',
			'UPDATE_COMPLETE'
		]
	})
	.promise()
	.then(console.log)
	.catch(console.error)
);

function getCloudFormationOperation(StackName) {
	return cloudFormation
		.describeStacks({
			StackName
		})
		.promise()
		.then(() => 'updateStack')
		.catch(() => 'createStack');
}

gulp.task('deployStack', () => getCloudFormationOperation(StackName)
	.then(operation => cloudFormation[operation]({
			StackName,
			Capabilities: [
				'CAPABILITY_IAM'
			],
			Parameters: Object
				.keys(config)
				.map(key => ({
					ParameterKey: key,
					ParameterValue: typeof config[key] === 'string' ? config[key] : JSON.stringify(config[key])
				})),
			TemplateBody: fs.readFileSync('./cloudformation.json', {encoding: 'utf8'})
		})
			.promise()
	)
	.then(console.log)
	.catch(console.error)
);

gulp.task('updateConfig', () => cloudFormation
	.waitFor(
		'stackCreateComplete',
		{
			StackName
		}
	)
	.promise()
	.then(data => {
		console.log(util.inspect(data, {depth:5}));
		
		const configParams = {
			'AccessKey': 'accessKeyId',
			'AccessSecret': 'secretAccessKey'
		};

		for (const item of data.Stacks[0].Outputs)
			config[configParams[item.OutputKey]] = item.OutputValue;
		
		fs.writeFileSync(
			'./config.json',
			JSON.stringify(config, null, '\t'),
			'utf8'
		);
	})
);

// Once the stack is deployed, this will update the function if the code is changed without recreating the stack
gulp.task('updateCode', () => cloudFormation
	.describeStackResource({
		StackName,
		LogicalResourceId: 'Lambda'
	})
	.promise()
	.then(({StackResourceDetail: PhysicalResourceId}) => lambda
		.updateFunctionCode({
			FunctionName: PhysicalResourceId,
			S3Bucket: LambdaS3Bucket,
			S3Key: LambdaS3Key
		})
		.promise()
	)
);

gulp.task('build', cb =>
	runSequence(
		'clean',
		['js', 'npm'],
		'zip',
		cb
	)
);

// Builds the function and uploads
gulp.task('build-upload', cb =>
	runSequence(
		'build',
		'upload',
		cb
	)
);

// For an already created stack
gulp.task('update', cb =>
	runSequence(
		'updateConfig',
		'build-upload',
		'updateCode',
		cb
	)
);

// For a new stack (or you change cloudformation.json)
gulp.task('default', cb =>
	runSequence(
		'build-upload',
		'deployStack',
		cb
	)
);

const ciStackName = `CI-for-${StackName}`;

gulp.task('ci-bootstrap', () => {
	const StackName = ciStackName;

	const outputEnvMap = new Map([
		['CIUserAccessKey', 'AWS_ACCESS_KEY_ID'],
		['CIUserSecretKey', 'AWS_SECRET_ACCESS_KEY'],
		['CIRegion', 'AWS_REGION'],
		['Bucket', 'CFN_S3_BUCKET'],
		['CognitoRole', 'ROLE_ARN']
	]);

	return getCloudFormationOperation(StackName)
		.then((operation) => cloudFormation[operation]({
				StackName,
				Capabilities: [
					'CAPABILITY_NAMED_IAM'
				],
				TemplateBody: fs.readFileSync(
					path.join(
						__dirname,
						'tests/bootstrap.template'
					),
					{
						encoding: 'utf8'
					}
				)
			})
				.promise()
				.then(() => `stack${operation === 'createStack' ? 'Create' : 'Update'}Complete`)
		)
		.then(condition => cloudFormation
			.waitFor(condition, {
				StackName
			})
			.promise()
		)
		.catch(console.error)
		.then(() => cloudFormation
			.describeStacks({
				StackName
			})
			.promise()
		)
		.then(({Stacks: [{Outputs}]}) => console.log(
			Outputs
				.map(({OutputKey, OutputValue}) => `${outputEnvMap.get(OutputKey)}=${OutputValue}`)
				.join('\n')
		));
});
