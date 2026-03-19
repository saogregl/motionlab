vcpkg_from_github(
    OUT_SOURCE_PATH SOURCE_PATH
    REPO Open-Cascade-SAS/OCCT
    REF V8_0_0_rc4
    SHA512 c428e114aa902d4cf5de0243d3e8222fc67e313c96ed4a7cf6c566d11c7c75577006a4cab257106400f6e68867fdc6567a90ba6a6ba90df48fb1fd42e5d3cba8
    HEAD_REF master
    PATCHES
        fix-pdb-install-vcpkg-layout.patch
)

if (VCPKG_LIBRARY_LINKAGE STREQUAL "dynamic")
    set(BUILD_TYPE "Shared")
else()
    set(BUILD_TYPE "Static")
endif()

vcpkg_check_features(OUT_FEATURE_OPTIONS FEATURE_OPTIONS
    FEATURES
        freetype    USE_FREETYPE
        rapidjson   USE_RAPIDJSON
)
vcpkg_cmake_configure(
    SOURCE_PATH "${SOURCE_PATH}"
    OPTIONS
        ${FEATURE_OPTIONS}
        -DBUILD_LIBRARY_TYPE=${BUILD_TYPE}
        -DINSTALL_DIR_LAYOUT=Vcpkg
        -DBUILD_USE_VCPKG=ON
        -DBUILD_CPP_STANDARD=C++20
        -DBUILD_MODULE_Draw=OFF
        -DBUILD_DOC_Overview=OFF
        -DINSTALL_TEST_CASES=OFF
        -DUSE_OPENGL=ON
        -DUSE_TK=OFF
        -DUSE_FREEIMAGE=OFF
        -DUSE_TBB=OFF
        -DUSE_VTK=OFF
        -DUSE_DRACO=OFF
        -DUSE_FFMPEG=OFF
        -DUSE_OPENVR=OFF
        -DUSE_GLES2=OFF
        -DUSE_D3D=OFF
        -DBUILD_GTEST=OFF
        -DBUILD_USE_PCH=OFF
)

vcpkg_cmake_install()

vcpkg_cmake_config_fixup(CONFIG_PATH share/opencascade)

# For static builds, ensure OCCT_STATIC_BUILD is defined so dllexport/dllimport
# macros resolve correctly
if(VCPKG_LIBRARY_LINKAGE STREQUAL "static")
    vcpkg_replace_string(
        "${CURRENT_PACKAGES_DIR}/include/opencascade/Standard_Macro.hxx"
        "defined(OCCT_STATIC_BUILD)"
        "(1)"
    )
endif()

file(REMOVE_RECURSE "${CURRENT_PACKAGES_DIR}/debug/include")
file(REMOVE_RECURSE "${CURRENT_PACKAGES_DIR}/debug/share")

vcpkg_install_copyright(
    FILE_LIST
        "${SOURCE_PATH}/LICENSE_LGPL_21.txt"
        "${SOURCE_PATH}/OCCT_LGPL_EXCEPTION.txt"
)
