// Import required modules from AWS SDK v3
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const sharp = require('sharp');

// Configure AWS S3
const s3 = new S3Client({
    region: 'ap-south-1',
    credentials: {
        accessKeyId: '',
        secretAccessKey: 'Enfuy2SsulmGWmk2VdzTnds2k2mjoEz7jzfjLKR9',
    },
});

const uploadToS3 = async (base64Image, filename) => {
    // Convert base64 string to buffer
    const buffer = Buffer.from(base64Image.split(',')[1], 'base64');

     if (!buffer || buffer.length === 0) {
        console.error("Buffer is empty");
        throw new Error("Input Buffer is empty");
    }

    // Optional: Resize or manipulate the image for thumbnail
    const resizedBuffer = await sharp(buffer).resize(320, 180).toBuffer();

    const params = {
        Bucket: 'alphadata-bucket',
        Key: filename,
        Body: resizedBuffer,
        ContentType: 'image/png',
    };

    // Use PutObjectCommand to upload the image to S3
    try {
        const command = new PutObjectCommand(params);
        const data = await s3.send(command);
        return data;
    } catch (error) {
        console.error('Error uploading to S3:', error);
        throw error;
    }
};

module.exports = uploadToS3;
