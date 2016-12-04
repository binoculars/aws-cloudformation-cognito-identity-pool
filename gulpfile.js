'use strict';

const fs = require('fs');
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

const stackName = 'cognito-identity-pool';

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

gulp.task('upload', () => s3
	.putObject({
		Bucket: config.LambdaS3Bucket,
		Key: config.LambdaS3Key,
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

gulp.task('deployStack', () => {
	return cloudFormation.describeStacks({
		StackName: stackName
	}, function(err) {
		const operation = err ? 'createStack' : 'updateStack';

		return cloudFormation[operation]({
			StackName: stackName,
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
			.then(console.log)
			.catch(console.error);
	});
});

gulp.task('updateConfig', () => cloudFormation
	.waitFor(
		'stackCreateComplete',
		{
			StackName: stackName
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
		StackName: stackName,
		LogicalResourceId: 'Lambda'
	})
	.promise()
	.then(data => lambda
		.updateFunctionCode({
			FunctionName: data.StackResourceDetail.PhysicalResourceId,
			S3Bucket: config.LambdaS3Bucket,
			S3Key: config.LambdaS3Key
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