# FindEigen3.cmake — patched for Eigen 5.x compatibility
#
# Eigen 5 moved version macros from Eigen/src/Core/util/Macros.h to
# Eigen/Version. This patched finder reads from both locations.
# See: https://github.com/projectchrono/chrono/issues/619
#
# This file replaces Chrono 9.0.1's cmake/FindEigen3.cmake at configure time
# via PATCH_COMMAND in FetchContent.

if(NOT Eigen3_FIND_VERSION)
  if(NOT Eigen3_FIND_VERSION_MAJOR)
    set(Eigen3_FIND_VERSION_MAJOR 2)
  endif()
  if(NOT Eigen3_FIND_VERSION_MINOR)
    set(Eigen3_FIND_VERSION_MINOR 91)
  endif()
  if(NOT Eigen3_FIND_VERSION_PATCH)
    set(Eigen3_FIND_VERSION_PATCH 0)
  endif()
  set(Eigen3_FIND_VERSION "${Eigen3_FIND_VERSION_MAJOR}.${Eigen3_FIND_VERSION_MINOR}.${Eigen3_FIND_VERSION_PATCH}")
endif()

macro(_eigen3_check_version)
  file(READ "${EIGEN3_INCLUDE_DIR}/Eigen/src/Core/util/Macros.h" _eigen3_version_header)

  string(REGEX MATCH "define[ \t]+EIGEN_WORLD_VERSION[ \t]+([0-9]+)" _eigen3_world_version_match "${_eigen3_version_header}")
  set(EIGEN3_WORLD_VERSION "${CMAKE_MATCH_1}")
  string(REGEX MATCH "define[ \t]+EIGEN_MAJOR_VERSION[ \t]+([0-9]+)" _eigen3_major_version_match "${_eigen3_version_header}")
  set(EIGEN3_MAJOR_VERSION "${CMAKE_MATCH_1}")
  string(REGEX MATCH "define[ \t]+EIGEN_MINOR_VERSION[ \t]+([0-9]+)" _eigen3_minor_version_match "${_eigen3_version_header}")
  set(EIGEN3_MINOR_VERSION "${CMAKE_MATCH_1}")

  # Eigen 5.x moved version macros to Eigen/Version
  if(NOT EIGEN3_WORLD_VERSION)
    if(EXISTS "${EIGEN3_INCLUDE_DIR}/Eigen/Version")
      file(READ "${EIGEN3_INCLUDE_DIR}/Eigen/Version" _eigen3_version_header)
      string(REGEX MATCH "define[ \t]+EIGEN_WORLD_VERSION[ \t]+([0-9]+)" _eigen3_world_version_match "${_eigen3_version_header}")
      set(EIGEN3_WORLD_VERSION "${CMAKE_MATCH_1}")
      string(REGEX MATCH "define[ \t]+EIGEN_MAJOR_VERSION[ \t]+([0-9]+)" _eigen3_major_version_match "${_eigen3_version_header}")
      set(EIGEN3_MAJOR_VERSION "${CMAKE_MATCH_1}")
      string(REGEX MATCH "define[ \t]+EIGEN_MINOR_VERSION[ \t]+([0-9]+)" _eigen3_minor_version_match "${_eigen3_version_header}")
      set(EIGEN3_MINOR_VERSION "${CMAKE_MATCH_1}")
    endif()
  endif()

  set(EIGEN3_VERSION ${EIGEN3_WORLD_VERSION}.${EIGEN3_MAJOR_VERSION}.${EIGEN3_MINOR_VERSION})
  if(${EIGEN3_VERSION} VERSION_LESS ${Eigen3_FIND_VERSION})
    set(EIGEN3_VERSION_OK FALSE)
  else()
    set(EIGEN3_VERSION_OK TRUE)
  endif()

  if(NOT EIGEN3_VERSION_OK)
    message(STATUS "Eigen3 version ${EIGEN3_VERSION} found in ${EIGEN3_INCLUDE_DIR}, "
                   "but at least version ${Eigen3_FIND_VERSION} is required")
  endif()
endmacro()

if(EIGEN3_INCLUDE_DIR)
  # in cache already
  _eigen3_check_version()
  set(EIGEN3_FOUND ${EIGEN3_VERSION_OK})
else()
  find_path(EIGEN3_INCLUDE_DIR NAMES signature_of_eigen3_matrix_library
    PATHS
      ${CMAKE_INSTALL_PREFIX}/include
      ${KDE4_INCLUDE_DIR}
    PATH_SUFFIXES eigen3 eigen
  )

  if(EIGEN3_INCLUDE_DIR)
    _eigen3_check_version()
  endif()

  include(FindPackageHandleStandardArgs)
  find_package_handle_standard_args(Eigen3 DEFAULT_MSG EIGEN3_INCLUDE_DIR EIGEN3_VERSION_OK)

  mark_as_advanced(EIGEN3_INCLUDE_DIR)
endif()
