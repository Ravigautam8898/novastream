// server/src/utils/ApiResponse.js
// ✅ Standardized API success responses

class ApiResponse {
  /**
   * Send a success response
   */
  static success(res, data = null, message = 'Success', statusCode = 200) {
    return res.status(statusCode).json({
      success: true,
      message,
      data,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Send a paginated response
   */
  static paginated(res, data, pagination) {
    return res.status(200).json({
      success: true,
      message: 'Success',
      data,
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total: pagination.total,
        totalPages: pagination.totalPages,
        hasNext: pagination.page < pagination.totalPages,
        hasPrev: pagination.page > 1,
      },
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Send a created response (201)
   */
  static created(res, data = null, message = 'Created successfully') {
    return this.success(res, data, message, 201);
  }

  /**
   * Send a no-content response (204)
   */
  static noContent(res) {
    return res.status(204).send();
  }
}

module.exports = ApiResponse;
