// server/src/utils/__tests__/ApiResponse.test.js
// NovaStream — ApiResponse unit tests
// Tests for the standardized API success response builder

const ApiResponse = require('../ApiResponse');

describe('ApiResponse', () => {
  let mockRes;

  beforeEach(() => {
    // Create a mock Express response object
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    };
  });

  describe('success', () => {
    it('should return 200 with default message and null data', () => {
      ApiResponse.success(mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'Success',
          data: null,
        })
      );
    });

    it('should include ISO timestamp', () => {
      ApiResponse.success(mockRes, { id: 1 });

      const callArg = mockRes.json.mock.calls[0][0];
      expect(callArg).toHaveProperty('timestamp');
      expect(typeof callArg.timestamp).toBe('string');
      expect(() => new Date(callArg.timestamp)).not.toThrow();
    });

    it('should accept custom data and message', () => {
      const data = { items: [1, 2, 3] };
      ApiResponse.success(mockRes, data, 'Items loaded');

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'Items loaded',
          data: { items: [1, 2, 3] },
        })
      );
    });

    it('should accept custom status code', () => {
      ApiResponse.success(mockRes, null, 'Created', 201);

      expect(mockRes.status).toHaveBeenCalledWith(201);
    });

    it('should send empty data object when omitted', () => {
      ApiResponse.success(mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ data: null })
      );
    });
  });

  describe('paginated', () => {
    const mockPagination = {
      page: 3,
      limit: 20,
      total: 100,
      totalPages: 5,
    };

    it('should return 200 with pagination metadata', () => {
      const data = [{ id: 1 }, { id: 2 }];
      ApiResponse.paginated(mockRes, data, mockPagination);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'Success',
          data: [{ id: 1 }, { id: 2 }],
          pagination: {
            page: 3,
            limit: 20,
            total: 100,
            totalPages: 5,
            hasNext: true,
            hasPrev: true,
          },
        })
      );
    });

    it('should handle first page (hasPrev: false)', () => {
      ApiResponse.paginated(mockRes, [], { page: 1, limit: 20, total: 100, totalPages: 5 });

      const callArg = mockRes.json.mock.calls[0][0];
      expect(callArg.pagination.hasNext).toBe(true);
      expect(callArg.pagination.hasPrev).toBe(false);
    });

    it('should handle last page (hasNext: false)', () => {
      ApiResponse.paginated(mockRes, [], { page: 5, limit: 20, total: 100, totalPages: 5 });

      const callArg = mockRes.json.mock.calls[0][0];
      expect(callArg.pagination.hasNext).toBe(false);
      expect(callArg.pagination.hasPrev).toBe(true);
    });

    it('should handle single page (no prev, no next)', () => {
      ApiResponse.paginated(mockRes, [], { page: 1, limit: 20, total: 5, totalPages: 1 });

      const callArg = mockRes.json.mock.calls[0][0];
      expect(callArg.pagination.hasNext).toBe(false);
      expect(callArg.pagination.hasPrev).toBe(false);
    });
  });

  describe('created', () => {
    it('should return 201 with default message', () => {
      ApiResponse.created(mockRes, { id: 42 });

      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'Created successfully',
          data: { id: 42 },
        })
      );
    });

    it('should accept custom message', () => {
      ApiResponse.created(mockRes, null, 'User created');

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'User created' })
      );
    });
  });

  describe('noContent', () => {
    it('should return 204 with no body', () => {
      ApiResponse.noContent(mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(204);
      expect(mockRes.send).toHaveBeenCalled();
      expect(mockRes.json).not.toHaveBeenCalled();
    });
  });
});
