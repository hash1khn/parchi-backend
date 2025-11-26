# Student Signup API - Flutter Integration Guide

This guide provides step-by-step instructions for integrating the Student Signup API endpoint into your Flutter application.

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [API Endpoint Details](#api-endpoint-details)
3. [Request/Response Formats](#requestresponse-formats)
4. [Flutter Implementation](#flutter-implementation)
5. [Error Handling](#error-handling)
6. [Complete Example](#complete-example)
7. [Testing](#testing)

---

## 🎯 Overview

The Student Signup API allows students to register with their personal information, university details, and verification documents (Student ID and Selfie images).

**Key Points:**
- Students must upload images to Supabase Storage first (get URLs)
- Then send all data including image URLs to the signup endpoint
- Account is created with `verification_status: 'pending'`
- Student receives a unique `parchiId` (e.g., `PK-12345`)
- Account remains inactive until admin approval

---

## 🔌 API Endpoint Details

### Endpoint
```
POST /auth/student/signup
```

### Base URL
```
Development: http://localhost:3000
Production: https://your-api-domain.com
```

### Headers
```dart
{
  'Content-Type': 'application/json',
}
```

### Authentication
No authentication required (public endpoint)

---

## 📡 Request/Response Formats

### Request Body

```json
{
  "firstName": "John",
  "lastName": "Doe",
  "email": "john.doe@university.edu",
  "password": "securePassword123",
  "phone": "+92 300 1234567",
  "university": "FAST NUCES",
  "studentIdImageUrl": "https://supabase.co/storage/v1/object/public/kyc/user123/student_id_123456.jpg",
  "selfieImageUrl": "https://supabase.co/storage/v1/object/public/kyc/user123/selfie_123456.jpg"
}
```

**Field Requirements:**
- `firstName` (required): String, max 100 characters
- `lastName` (required): String, max 100 characters
- `email` (required): Valid email format, must be unique
- `password` (required): String, minimum 6 characters
- `phone` (optional): String, phone number format
- `university` (required): String, university name
- `studentIdImageUrl` (required): Valid HTTPS URL to uploaded Student ID image
- `selfieImageUrl` (required): Valid HTTPS URL to uploaded Selfie image

**Supported Universities:**
- FAST NUCES
- IBA Karachi
- LUMS
- NUST
- Karachi University
- Szabist

### Success Response (201 Created)

```json
{
  "status": 201,
  "message": "Student signup request submitted successfully. Verification pending.",
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "john.doe@university.edu",
    "firstName": "John",
    "lastName": "Doe",
    "university": "FAST NUCES",
    "parchiId": "PK-12345",
    "verificationStatus": "pending",
    "createdAt": "2024-01-15T10:30:00.000Z"
  }
}
```

### Error Responses

#### 400 Bad Request - Validation Error
```json
{
  "statusCode": 400,
  "message": [
    "firstName should not be empty",
    "email must be an email",
    "password must be longer than or equal to 6 characters"
  ],
  "error": "Bad Request"
}
```

#### 409 Conflict - Email Already Exists
```json
{
  "statusCode": 409,
  "message": "Email already registered",
  "error": "Conflict"
}
```

#### 422 Unprocessable Entity - Invalid Image URLs
```json
{
  "statusCode": 422,
  "message": "Invalid image URLs or images not accessible",
  "error": "Unprocessable Entity"
}
```

#### 500 Internal Server Error
```json
{
  "statusCode": 500,
  "message": "Internal server error",
  "error": "Internal Server Error"
}
```

---

## 💻 Flutter Implementation

### Step 1: Add Dependencies

Add the following to your `pubspec.yaml`:

```yaml
dependencies:
  flutter:
    sdk: flutter
  http: ^1.1.0
  image_picker: ^1.0.4
  # Add other dependencies you need
```

### Step 2: Create API Service

Create a file `lib/services/api_service.dart`:

```dart
import 'dart:convert';
import 'package:http/http.dart' as http;

class ApiService {
  // Update with your actual API base URL
  static const String baseUrl = 'http://localhost:3000';
  // For production: static const String baseUrl = 'https://your-api-domain.com';

  // Student Signup Endpoint
  static const String studentSignupEndpoint = '$baseUrl/auth/student/signup';

  /// Student Signup with verification documents
  /// 
  /// Returns the signup response data on success
  /// Throws an exception on error
  static Future<Map<String, dynamic>> studentSignup({
    required String firstName,
    required String lastName,
    required String email,
    required String password,
    String? phone,
    required String university,
    required String studentIdImageUrl,
    required String selfieImageUrl,
  }) async {
    try {
      // Prepare request body
      final requestBody = {
        'firstName': firstName,
        'lastName': lastName,
        'email': email,
        'password': password,
        if (phone != null && phone.isNotEmpty) 'phone': phone,
        'university': university,
        'studentIdImageUrl': studentIdImageUrl,
        'selfieImageUrl': selfieImageUrl,
      };

      // Make POST request
      final response = await http.post(
        Uri.parse(studentSignupEndpoint),
        headers: {
          'Content-Type': 'application/json',
        },
        body: jsonEncode(requestBody),
      );

      // Parse response
      final responseData = jsonDecode(response.body) as Map<String, dynamic>;

      // Check for errors
      if (response.statusCode >= 200 && response.statusCode < 300) {
        return responseData;
      } else {
        // Handle error response
        throw _handleError(response.statusCode, responseData);
      }
    } on http.ClientException {
      throw Exception('Network error. Please check your internet connection.');
    } catch (e) {
      if (e is Exception) {
        rethrow;
      }
      throw Exception('Student signup failed: ${e.toString()}');
    }
  }

  /// Handle API error responses
  static Exception _handleError(int statusCode, Map<String, dynamic> errorData) {
    final message = errorData['message'] ?? 'An error occurred';
    
    switch (statusCode) {
      case 400:
        return ValidationException(message);
      case 409:
        return ConflictException(message);
      case 422:
        return UnprocessableEntityException(message);
      case 500:
        return ServerException(message);
      default:
        return Exception(message);
    }
  }
}

// Custom Exception Classes
class ValidationException implements Exception {
  final String message;
  ValidationException(this.message);
  
  @override
  String toString() => message;
}

class ConflictException implements Exception {
  final String message;
  ConflictException(this.message);
  
  @override
  String toString() => message;
}

class UnprocessableEntityException implements Exception {
  final String message;
  UnprocessableEntityException(this.message);
  
  @override
  String toString() => message;
}

class ServerException implements Exception {
  final String message;
  ServerException(this.message);
  
  @override
  String toString() => message;
}
```

### Step 3: Create Signup Screen Model/Provider

Create a file `lib/models/student_signup_model.dart`:

```dart
class StudentSignupModel {
  final String firstName;
  final String lastName;
  final String email;
  final String password;
  final String? phone;
  final String university;
  final String studentIdImageUrl;
  final String selfieImageUrl;

  StudentSignupModel({
    required this.firstName,
    required this.lastName,
    required this.email,
    required this.password,
    this.phone,
    required this.university,
    required this.studentIdImageUrl,
    required this.selfieImageUrl,
  });

  Map<String, dynamic> toJson() {
    return {
      'firstName': firstName,
      'lastName': lastName,
      'email': email,
      'password': password,
      if (phone != null && phone!.isNotEmpty) 'phone': phone,
      'university': university,
      'studentIdImageUrl': studentIdImageUrl,
      'selfieImageUrl': selfieImageUrl,
    };
  }
}

class StudentSignupResponse {
  final String id;
  final String email;
  final String firstName;
  final String lastName;
  final String university;
  final String parchiId;
  final String verificationStatus;
  final DateTime createdAt;

  StudentSignupResponse({
    required this.id,
    required this.email,
    required this.firstName,
    required this.lastName,
    required this.university,
    required this.parchiId,
    required this.verificationStatus,
    required this.createdAt,
  });

  factory StudentSignupResponse.fromJson(Map<String, dynamic> json) {
    return StudentSignupResponse(
      id: json['id'] as String,
      email: json['email'] as String,
      firstName: json['firstName'] as String,
      lastName: json['lastName'] as String,
      university: json['university'] as String,
      parchiId: json['parchiId'] as String,
      verificationStatus: json['verificationStatus'] as String,
      createdAt: DateTime.parse(json['createdAt'] as String),
    );
  }
}
```

### Step 4: Integrate in Your Signup Screen

In your `signup_screen_two.dart` or wherever you handle the final signup step:

```dart
import 'package:flutter/material.dart';
import '../services/api_service.dart';
import '../models/student_signup_model.dart';

class SignupScreenTwo extends StatefulWidget {
  final String firstName;
  final String lastName;
  final String email;
  final String password;
  final String? phone;
  final String university;
  final Map<String, String> imageUrls; // Contains 'studentIdUrl' and 'selfieUrl'

  const SignupScreenTwo({
    Key? key,
    required this.firstName,
    required this.lastName,
    required this.email,
    required this.password,
    this.phone,
    required this.university,
    required this.imageUrls,
  }) : super(key: key);

  @override
  State<SignupScreenTwo> createState() => _SignupScreenTwoState();
}

class _SignupScreenTwoState extends State<SignupScreenTwo> {
  bool _isLoading = false;

  Future<void> _submitSignup() async {
    // Validate image URLs are present
    if (widget.imageUrls['studentIdUrl'] == null ||
        widget.imageUrls['selfieUrl'] == null) {
      _showError('Please upload both Student ID and Selfie images');
      return;
    }

    setState(() {
      _isLoading = true;
    });

    try {
      // Call the API
      final response = await ApiService.studentSignup(
        firstName: widget.firstName,
        lastName: widget.lastName,
        email: widget.email,
        password: widget.password,
        phone: widget.phone,
        university: widget.university,
        studentIdImageUrl: widget.imageUrls['studentIdUrl']!,
        selfieImageUrl: widget.imageUrls['selfieUrl']!,
      );

      // Parse response
      final signupData = response['data'] as Map<String, dynamic>;
      final signupResponse = StudentSignupResponse.fromJson(signupData);

      // Navigate to success screen
      if (mounted) {
        Navigator.pushReplacement(
          context,
          MaterialPageRoute(
            builder: (context) => SignupVerificationScreen(
              parchiId: signupResponse.parchiId,
              email: signupResponse.email,
            ),
          ),
        );
      }
    } on ValidationException catch (e) {
      _showError('Validation error: ${e.message}');
    } on ConflictException catch (e) {
      _showError('Email already registered. Please use a different email.');
    } on UnprocessableEntityException catch (e) {
      _showError('Invalid image URLs. Please re-upload your images.');
    } on ServerException catch (e) {
      _showError('Server error: ${e.message}');
    } catch (e) {
      _showError('Signup failed: ${e.toString()}');
    } finally {
      if (mounted) {
        setState(() {
          _isLoading = false;
        });
      }
    }
  }

  void _showError(String message) {
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(message),
          backgroundColor: Colors.red,
          duration: const Duration(seconds: 4),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Complete Signup')),
      body: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          children: [
            // Your existing UI for displaying uploaded images
            // ...
            
            const Spacer(),
            
            ElevatedButton(
              onPressed: _isLoading ? null : _submitSignup,
              style: ElevatedButton.styleFrom(
                minimumSize: const Size(double.infinity, 50),
              ),
              child: _isLoading
                  ? const SizedBox(
                      height: 20,
                      width: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Text('Submit Signup'),
            ),
          ],
        ),
      ),
    );
  }
}
```

---

## ⚠️ Error Handling

### Common Error Scenarios

1. **Network Errors**
   - Check internet connection
   - Show user-friendly message
   - Allow retry

2. **Validation Errors (400)**
   - Display specific field errors
   - Highlight invalid fields in UI
   - Guide user to fix issues

3. **Email Already Exists (409)**
   - Suggest using "Forgot Password" if they already have an account
   - Allow user to try different email

4. **Invalid Image URLs (422)**
   - Prompt user to re-upload images
   - Verify Supabase Storage URLs are accessible

5. **Server Errors (500)**
   - Show generic error message
   - Log error for debugging
   - Suggest trying again later

### Error Handling Best Practices

```dart
try {
  final response = await ApiService.studentSignup(...);
  // Handle success
} on ValidationException catch (e) {
  // Show field-specific errors
  _showValidationErrors(e.message);
} on ConflictException catch (e) {
  // Email conflict - specific handling
  _showEmailConflictDialog();
} on UnprocessableEntityException catch (e) {
  // Image URL issues
  _promptReuploadImages();
} on ServerException catch (e) {
  // Server error - generic message
  _showGenericError('Something went wrong. Please try again.');
} catch (e) {
  // Unknown error
  _showGenericError('An unexpected error occurred.');
}
```

---

## 📝 Complete Example

Here's a complete example showing the full signup flow:

```dart
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'dart:convert';

class StudentSignupFlow {
  // Step 1: Upload images to Supabase Storage
  // (This should be done in your existing image upload service)
  Future<Map<String, String>> uploadImages({
    required String studentIdImagePath,
    required String selfieImagePath,
    required String userId,
  }) async {
    // Your existing Supabase Storage upload logic
    // Returns: {'studentIdUrl': '...', 'selfieUrl': '...'}
    return {};
  }

  // Step 2: Submit signup data to backend
  Future<void> completeSignup({
    required String firstName,
    required String lastName,
    required String email,
    required String password,
    String? phone,
    required String university,
    required Map<String, String> imageUrls,
    required BuildContext context,
  }) async {
    try {
      final response = await http.post(
        Uri.parse('http://localhost:3000/auth/student/signup'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'firstName': firstName,
          'lastName': lastName,
          'email': email,
          'password': password,
          if (phone != null && phone.isNotEmpty) 'phone': phone,
          'university': university,
          'studentIdImageUrl': imageUrls['studentIdUrl'],
          'selfieImageUrl': imageUrls['selfieUrl'],
        }),
      );

      if (response.statusCode == 201) {
        final data = jsonDecode(response.body);
        final signupData = data['data'] as Map<String, dynamic>;
        
        // Show success and navigate
        if (context.mounted) {
          Navigator.pushReplacement(
            context,
            MaterialPageRoute(
              builder: (context) => SignupSuccessScreen(
                parchiId: signupData['parchiId'] as String,
                email: signupData['email'] as String,
              ),
            ),
          );
        }
      } else {
        // Handle error
        final error = jsonDecode(response.body);
        if (context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(error['message'] ?? 'Signup failed'),
              backgroundColor: Colors.red,
            ),
          );
        }
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Network error: ${e.toString()}'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }
}
```

---

## 🧪 Testing

### Test Cases

1. **Successful Signup**
   - Valid data with all required fields
   - Valid image URLs
   - Should return 201 with student data

2. **Validation Errors**
   - Missing required fields
   - Invalid email format
   - Password too short
   - Should return 400 with validation messages

3. **Duplicate Email**
   - Email already exists in database
   - Should return 409 Conflict

4. **Invalid Image URLs**
   - Malformed URLs
   - Inaccessible URLs
   - Should return 422 Unprocessable Entity

5. **Network Errors**
   - No internet connection
   - Timeout
   - Should handle gracefully

### Testing with Postman/cURL

```bash
curl -X POST http://localhost:3000/auth/student/signup \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "John",
    "lastName": "Doe",
    "email": "john.doe@university.edu",
    "password": "password123",
    "phone": "+92 300 1234567",
    "university": "FAST NUCES",
    "studentIdImageUrl": "https://example.com/student-id.jpg",
    "selfieImageUrl": "https://example.com/selfie.jpg"
  }'
```

---

## 🔐 Security Considerations

1. **Password Security**
   - Never log or display passwords
   - Use HTTPS in production
   - Consider password strength requirements

2. **Image URL Validation**
   - Verify URLs are from your Supabase domain
   - Validate image accessibility
   - Check file size limits

3. **Error Messages**
   - Don't expose sensitive information in error messages
   - Use generic messages for security errors

4. **Rate Limiting**
   - Implement rate limiting on client side
   - Show appropriate messages if rate limited

---

## 📚 Additional Resources

- [HTTP Package Documentation](https://pub.dev/packages/http)
- [Flutter Error Handling Best Practices](https://docs.flutter.dev/cookbook/networking/error-handling)
- [Supabase Storage Documentation](https://supabase.com/docs/guides/storage)

---

## 🆘 Troubleshooting

### Issue: "Network error" on signup
**Solution:** Check API base URL, verify server is running, check internet connection

### Issue: "Email already registered" for new email
**Solution:** Check if email exists in database, verify email format

### Issue: "Invalid image URLs"
**Solution:** Verify Supabase Storage URLs are public and accessible, check URL format

### Issue: Timeout errors
**Solution:** Increase timeout duration, check server response time, verify network stability

---

## 📞 Support

If you encounter issues:
1. Check API logs for detailed error messages
2. Verify Supabase storage URLs are accessible
3. Ensure database connection is working
4. Check network connectivity from Flutter app
5. Review error response for specific field issues

---

**Last Updated:** 2024-01-15  
**API Version:** 1.0.0  
**Flutter Version:** Compatible with Flutter 3.0+

