const authService = require('../src/services/auth.service');
const { AppError, AuthErrorCodes } = require('../src/middlewares/errorHandler');
const dbClient = require('../src/services/db-client');
const jwt = require('../src/utils/jwt');

// Mock des dépendances
jest.mock('../src/services/db-client');
jest.mock('../src/utils/jwt');

describe('AuthService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('register', () => {
    const mockUserData = {
      email: 'test@example.com',
      password: 'Password123!',
      firstName: 'John',
      lastName: 'Doe'
    };

    it('should register a new user successfully', async () => {
      // Arrange
      dbClient.getUserByEmail.mockResolvedValue(null);
      dbClient.createUser.mockResolvedValue({
        id: 'user123',
        email: mockUserData.email,
        firstName: mockUserData.firstName,
        lastName: mockUserData.lastName,
        password: 'hashed_password',
        roles: ['USER'],
        active: true,
        emailVerified: false,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      // Act
      const result = await authService.register(mockUserData);

      // Assert
      expect(dbClient.getUserByEmail).toHaveBeenCalledWith(mockUserData.email);
      expect(dbClient.createUser).toHaveBeenCalledWith({
        data: expect.objectContaining({
          email: mockUserData.email,
          firstName: mockUserData.firstName,
          lastName: mockUserData.lastName,
          roles: ['USER']
        })
      });
      expect(result).not.toHaveProperty('password');
      expect(result.email).toBe(mockUserData.email);
    });

    it('should throw error when email already exists', async () => {
      // Arrange
      dbClient.getUserByEmail.mockResolvedValue({
        id: 'existing_user',
        email: mockUserData.email
      });

      // Act & Assert
      await expect(authService.register(mockUserData))
        .rejects.toMatchObject({
          message: 'Cet email est déjà utilisé',
          statusCode: 400,
          errorCode: AuthErrorCodes.EMAIL_ALREADY_IN_USE
        });
    });
  });

  describe('login', () => {
    const mockUser = {
      id: 'user123',
      email: 'test@example.com',
      password: 'hashed_password',
      active: true,
      firstName: 'John',
      lastName: 'Doe'
    };

    it('should login successfully with valid credentials', async () => {
      // Arrange
      dbClient.getUserByEmail.mockResolvedValue(mockUser);
      dbClient.verifyPassword.mockResolvedValue(true);
      jwt.generateAccessToken.mockResolvedValue('access_token');
      jwt.generateRefreshToken.mockResolvedValue('refresh_token');

      // Act
      const result = await authService.login('test@example.com', 'Password123!');

      // Assert
      expect(dbClient.getUserByEmail).toHaveBeenCalledWith('test@example.com');
      expect(dbClient.verifyPassword).toHaveBeenCalledWith('user123', 'Password123!');
      expect(jwt.generateAccessToken).toHaveBeenCalledWith(mockUser);
      expect(jwt.generateRefreshToken).toHaveBeenCalledWith('user123');
      expect(result).toEqual({
        success: true,
        accessToken: 'access_token',
        refreshToken: 'refresh_token',
        user: mockUser
      });
    });

    it('should throw error for non-existent user', async () => {
      // Arrange
      dbClient.getUserByEmail.mockResolvedValue(null);

      // Act & Assert
      await expect(authService.login('nonexistent@example.com', 'password'))
        .rejects.toThrow(AppError);

      await expect(authService.login('nonexistent@example.com', 'password'))
        .rejects.toMatchObject({
          message: 'Email ou mot de passe incorrect',
          statusCode: 401,
          errorCode: AuthErrorCodes.INVALID_CREDENTIALS
        });
    });

    it('should throw error for inactive user', async () => {
      // Arrange
      const inactiveUser = { ...mockUser, active: false };
      dbClient.getUserByEmail.mockResolvedValue(inactiveUser);

      // Act & Assert
      await expect(authService.login('test@example.com', 'Password123!'))
        .rejects.toMatchObject({
          message: 'Ce compte a été désactivé',
          statusCode: 403,
          errorCode: AuthErrorCodes.UNAUTHORIZED
        });
    });

    it('should throw error for invalid password', async () => {
      // Arrange
      dbClient.getUserByEmail.mockResolvedValue(mockUser);
      dbClient.verifyPassword.mockResolvedValue(false);

      // Act & Assert
      await expect(authService.login('test@example.com', 'wrong_password'))
        .rejects.toThrow(AppError);

      await expect(authService.login('test@example.com', 'wrong_password'))
        .rejects.toMatchObject({
          message: 'Email ou mot de passe incorrect',
          statusCode: 401,
          errorCode: AuthErrorCodes.INVALID_CREDENTIALS
        });
    });
  });

  describe('refreshToken', () => {
    const mockRefreshTokenData = {
      userId: 'user123',
      clientId: 'client123'
    };

    const mockUser = {
      id: 'user123',
      email: 'test@example.com',
      active: true
    };

    it('should refresh token successfully', async () => {
      // Arrange
      jwt.verifyRefreshToken.mockResolvedValue(mockRefreshTokenData);
      dbClient.getUserById.mockResolvedValue(mockUser);
      jwt.revokeRefreshToken.mockResolvedValue(true);
      jwt.generateRefreshToken.mockResolvedValue('new_refresh_token');
      jwt.generateAccessToken.mockResolvedValue('new_access_token');

      // Act
      const result = await authService.refreshToken('valid_refresh_token');

      // Assert
      expect(jwt.verifyRefreshToken).toHaveBeenCalledWith('valid_refresh_token');
      expect(dbClient.getUserById).toHaveBeenCalledWith('user123');
      expect(jwt.generateAccessToken).toHaveBeenCalledWith(mockUser);
      expect(jwt.revokeRefreshToken).toHaveBeenCalledWith('valid_refresh_token');
      expect(jwt.generateRefreshToken).toHaveBeenCalledWith('user123', 'client123');
      expect(result).toEqual({
        success: true,
        accessToken: 'new_access_token',
        refreshToken: 'new_refresh_token'
      });
    });

    it('should throw error for inactive user', async () => {
      // Arrange
      jwt.verifyRefreshToken.mockResolvedValue(mockRefreshTokenData);
      dbClient.getUserById.mockResolvedValue({
        ...mockUser,
        active: false
      });

      // Act & Assert
      await expect(authService.refreshToken('valid_refresh_token'))
        .rejects.toMatchObject({
          message: 'Utilisateur non trouvé ou inactif',
          statusCode: 401,
          errorCode: AuthErrorCodes.UNAUTHORIZED
        });
    });

    it('should throw error for non-existent user', async () => {
      // Arrange
      jwt.verifyRefreshToken.mockResolvedValue(mockRefreshTokenData);
      dbClient.getUserById.mockResolvedValue(null);

      // Act & Assert
      await expect(authService.refreshToken('valid_refresh_token'))
        .rejects.toThrow(AppError);
    });
  });

  describe('revokeToken', () => {
    it('should revoke token successfully', async () => {
      // Arrange
      jwt.revokeRefreshToken.mockResolvedValue(true);

      // Act
      const result = await authService.revokeToken('valid_refresh_token');

      // Assert
      expect(jwt.revokeRefreshToken).toHaveBeenCalledWith('valid_refresh_token');
      expect(result).toEqual({
        success: true,
        message: 'Token révoqué avec succès'
      });
    });

    it('should handle revocation failure', async () => {
      // Arrange
      jwt.revokeRefreshToken.mockResolvedValue(false);

      // Act
      const result = await authService.revokeToken('invalid_refresh_token');

      // Assert
      expect(result).toEqual({
        success: false,
        message: 'Échec de la révocation du token'
      });
    });
  });

  describe('getUserInfo', () => {
    const mockUser = {
      id: 'user123',
      email: 'test@example.com',
      emailVerified: true,
      firstName: 'John',
      lastName: 'Doe',
      picture: 'https://avatar.url',
      updatedAt: new Date('2024-01-01T00:00:00.000Z')
    };

    it('should return user info in OpenID Connect format', async () => {
      // Arrange
      dbClient.getUserById.mockResolvedValue(mockUser);

      // Act
      const result = await authService.getUserInfo('user123');

      // Assert
      expect(dbClient.getUserById).toHaveBeenCalledWith('user123');
      expect(result).toEqual({
        sub: 'user123',
        email: 'test@example.com',
        email_verified: true,
        name: 'John Doe',
        given_name: 'John',
        family_name: 'Doe',
        picture: 'https://avatar.url',
        updated_at: Math.floor(mockUser.updatedAt.getTime() / 1000)
      });
    });

    it('should throw error for non-existent user', async () => {
      // Arrange
      dbClient.getUserById.mockResolvedValue(null);

      // Act & Assert
      await expect(authService.getUserInfo('nonexistent_user'))
        .rejects.toMatchObject({
          message: 'Utilisateur non trouvé',
          statusCode: 404,
          errorCode: AuthErrorCodes.USER_NOT_FOUND
        });
    });

    it('should handle user with no names gracefully', async () => {
      // Arrange
      const userWithoutNames = {
        ...mockUser,
        firstName: null,
        lastName: null
      };
      dbClient.getUserById.mockResolvedValue(userWithoutNames);

      // Act
      const result = await authService.getUserInfo('user123');

      // Assert
      expect(result.name).toBe('');
      expect(result.given_name).toBe(null);
      expect(result.family_name).toBe(null);
    });
  });

  describe('Data validation and edge cases', () => {
    it('should handle database connection errors gracefully', async () => {
      // Arrange
      dbClient.getUserByEmail.mockRejectedValue(new Error('Database connection failed'));

      // Act & Assert
      await expect(authService.login('test@example.com', 'password'))
        .rejects.toThrow('Database connection failed');
    });
  });
}); 