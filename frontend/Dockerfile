# Use an appropriate Node.js version
FROM node:slim

# Set the working directory in the container
WORKDIR /app

# Copy package.json and package-lock.json (or yarn.lock) first
# This leverages Docker cache. Dependencies are only re-installed if these files change.
COPY package*.json ./

# Install project dependencies based on your package files
RUN npm install

# Copy the rest of your application code into the image.
# While the volume mount will overwrite this at runtime for development,
# having the code in the image is good practice and useful if you ever run
# without the volume mount or for other build steps.
COPY . .
# The volume mount `- ./frontend:/app` makes copying the source code here redundant
# and potentially confusing. The RUN npm install above is the key step for the image.

# Expose the port the app runs on
EXPOSE 3000

# The command to start the app (React development server)
CMD ["npm", "start"]